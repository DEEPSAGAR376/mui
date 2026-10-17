'use client';

/**
 * Playback state, and the one `<audio>` element the whole site shares.
 *
 * It lives in the root layout on purpose. App Router preserves layout client
 * components across navigation, so the element is never unmounted and a track
 * keeps playing while the user browses. Rendering the audio tag inside a page
 * would restart playback on every route change — the single most common way
 * these players break.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { TrackView } from '@/lib/supabase/types';
import { resolveAudioSrc } from '@/lib/cache';
import { prefetchAhead } from '@/lib/prefetch';

export type RepeatMode = 'off' | 'all' | 'one';

const VOLUME_KEY = 'mv:volume';
const LAST_KEY = 'mv:last';

interface PlayerApi {
  queue: TrackView[];
  current: TrackView | null;
  /** Index into `queue`, not into the shuffled play order. */
  currentIndex: number;
  /**
   * The play order: indices into `queue`, identity when shuffle is off. Exposed
   * so the queue panel can list what actually plays next rather than album order.
   */
  order: number[];
  /** Which slot of `order` is playing. The panel highlights on this, not on id. */
  position: number;
  isPlaying: boolean;
  /**
   * Waiting on bytes while it wants to be playing.
   *
   * Worth its own flag because the store's first byte takes 1-3s: without it the
   * play button flips to "pause" and then nothing audible happens, which reads as
   * a broken player rather than a slow one.
   */
  stalled: boolean;
  /**
   * The current track would not start at all -- a dead URL, an unsupported
   * container, a network failure. Distinct from `stalled`, which resolves itself.
   */
  failed: boolean;
  duration: number;
  volume: number;
  muted: boolean;
  shuffle: boolean;
  repeat: RepeatMode;
  /** Replace the queue and start playing at `startIndex`. */
  play: (tracks: TrackView[], startIndex?: number) => void;
  /** Replace the queue and play it shuffled, starting from a random track. */
  playShuffled: (tracks: TrackView[]) => void;
  toggle: () => void;
  next: () => void;
  previous: () => void;
  /** Play a given slot of `order`, leaving the order itself alone. */
  jumpTo: (orderPosition: number) => void;
  seek: (seconds: number) => void;
  /**
   * Relative seek. Exists so that callers do not have to read `currentTime` —
   * see the note on the two contexts below. The element's own clock is the input,
   * which is also more accurate than state sampled four times a second.
   */
  seekBy: (delta: number) => void;
  setVolume: (value: number) => void;
  toggleMute: () => void;
  toggleShuffle: () => void;
  cycleRepeat: () => void;
  /** Append without disturbing what is playing. */
  enqueue: (track: TrackView) => void;
}

const PlayerContext = createContext<PlayerApi | null>(null);

/**
 * Elapsed seconds, deliberately in a context of its own.
 *
 * `timeupdate` fires about four times a second, so while a track plays this value
 * changes constantly. Carrying it inside `PlayerApi` meant a new context value
 * four times a second, and therefore a re-render of every consumer four times a
 * second: the bar, the sheet, the queue panel, the blurred backdrop and every row
 * in the library — none of which display the time.
 *
 * Two providers, one component. `<audio>` is rendered by the same component and
 * its element identity is untouched, which is the constraint that outranks all of
 * this. `children` is the same element object on a time-only re-render, so React
 * skips the whole subtree and only actual `usePlayerTime()` consumers run. Today
 * that is `Scrubber` alone.
 */
const PlayerTimeContext = createContext(0);

export function usePlayer(): PlayerApi {
  const context = useContext(PlayerContext);
  if (!context) throw new Error('usePlayer must be used inside <PlayerProvider>');
  return context;
}

/** Elapsed seconds. Re-renders on every `timeupdate` — see `PlayerTimeContext`. */
export function usePlayerTime(): number {
  return useContext(PlayerTimeContext);
}

/** How long into a track to start prefetching the next one. */
const PREFETCH_AFTER_MS = 8_000;

/** Fisher-Yates over indices, with `first` pulled to the front if given. */
function shuffledOrder(length: number, first?: number): number[] {
  const order = Array.from({ length }, (_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  if (first !== undefined) {
    const at = order.indexOf(first);
    if (at > 0) [order[0], order[at]] = [order[at], order[0]];
  }
  return order;
}

export function PlayerProvider({ children }: { children: React.ReactNode }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  /**
   * Seek to apply once the element reports a duration. Setting `currentTime`
   * before `loadedmetadata` is silently discarded, which is why a restored
   * position needs deferring rather than assigning.
   */
  const pendingSeekRef = useRef<number | null>(null);

  const [queue, setQueue] = useState<TrackView[]>([]);
  /** Play order: indices into `queue`. Identity when shuffle is off. */
  const [order, setOrder] = useState<number[]>([]);
  const [position, setPosition] = useState(0);

  const [isPlaying, setIsPlaying] = useState(false);
  const [stalled, setStalled] = useState(false);
  const [failed, setFailed] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolumeState] = useState(1);
  const [muted, setMuted] = useState(false);
  const [shuffle, setShuffle] = useState(false);
  const [repeat, setRepeat] = useState<RepeatMode>('off');

  const currentIndex = order[position] ?? -1;
  const current = queue[currentIndex] ?? null;

  // Restore volume and the last track. Only the volume is applied to the element
  // here; the track is loaded paused, so the bar comes back with something in it
  // without autoplaying at someone on page load.
  useEffect(() => {
    try {
      const savedVolume = localStorage.getItem(VOLUME_KEY);
      if (savedVolume !== null) {
        const parsed = Number(savedVolume);
        if (Number.isFinite(parsed)) setVolumeState(Math.min(1, Math.max(0, parsed)));
      }

      const savedLast = localStorage.getItem(LAST_KEY);
      if (savedLast) {
        const { track, position: at } = JSON.parse(savedLast) as {
          track: TrackView;
          position: number;
        };
        if (track?.audio_url) {
          setQueue([track]);
          setOrder([0]);
          setPosition(0);
          setCurrentTime(at ?? 0);
          pendingSeekRef.current = at ?? 0;
        }
      }
    } catch {
      // Private-mode localStorage throws on read. A player with default volume is
      // a fine outcome; there is nothing to recover.
    }
  }, []);

  // Volume and mute are element properties, not attributes — they have to be
  // pushed imperatively rather than rendered.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = volume;
    audio.muted = muted;
  }, [volume, muted]);

  useEffect(() => {
    try {
      localStorage.setItem(VOLUME_KEY, String(volume));
    } catch {
      // Not worth surfacing; the session still works, it just won't be remembered.
    }
  }, [volume]);

  const advance = useCallback(
    (direction: 1 | -1) => {
      setPosition((prev) => {
        if (order.length === 0) return prev;
        const nextPosition = prev + direction;
        if (nextPosition < 0) return repeat === 'all' ? order.length - 1 : 0;
        if (nextPosition >= order.length) {
          if (repeat === 'all') return 0;
          // End of queue with repeat off: stay on the last track and stop.
          setIsPlaying(false);
          return prev;
        }
        return nextPosition;
      });
    },
    [order.length, repeat],
  );

  /**
   * Intent, as opposed to the element's actual state. `isPlaying` mirrors the
   * element's own play/pause events — the element is the source of truth, since
   * a stalled network or a rejected autoplay means "we asked to play" and "audio
   * is playing" are different facts.
   */
  const wantPlayRef = useRef(false);

  /**
   * Start the element, and classify a rejection instead of swallowing it.
   *
   * `play()` rejects for two unrelated reasons that need opposite treatment.
   * `NotAllowedError` means the browser wants a user gesture first -- nothing is
   * wrong with the track, so settling back to paused is the whole correct
   * response. Anything else means the media would not start, and that has to be
   * visible: every one of these calls used to `catch(() => setIsPlaying(false))`,
   * which made a dead URL and a deliberate pause the same picture.
   *
   * The `readyState` check is why it is a helper rather than a `catch`. Marking
   * the wait *before* asking is what lets the button show a spinner during the
   * second or more it takes the store to hand over a first byte, rather than
   * claiming to play in silence.
   */
  const startAudio = useCallback((audio: HTMLAudioElement) => {
    setFailed(false);
    if (audio.readyState < HTMLMediaElement.HAVE_FUTURE_DATA) setStalled(true);
    void audio.play().catch((err: unknown) => {
      setIsPlaying(false);
      setStalled(false);
      if (!(err instanceof DOMException) || err.name !== 'NotAllowedError') setFailed(true);
    });
  }, []);

  /**
   * Point the element at a track, and start it if asked.
   *
   * Extracted so that a click can do this *synchronously, inside the gesture*
   * rather than waiting for the effect below to notice the new `current`.
   * `setQueue`/`setPosition` only take effect after the commit, so the old
   * ordering put a React render between the tap and the first byte being asked
   * for. Against a store whose first byte takes over a second that ordering is
   * worth the small duplication — and starting playback inside the gesture is
   * also what keeps mobile autoplay policies satisfied.
   *
   * The `dataset.trackId` guard is what makes the two callers idempotent: whoever
   * gets there second finds the element already pointed at the right track and
   * only resumes it.
   */
  /**
   * Revoke any blob URL we previously created from the cache, so the blob can
   * be garbage-collected. Only blob: URLs are revoked; the original https: URL
   * is a server resource and revoking it would be a no-op at best.
   */
  const revokePreviousBlobRef = useRef<string | null>(null);

  const loadTrack = useCallback((track: TrackView, autoplay: boolean) => {
    const audio = audioRef.current;
    if (!audio) return;

    if (audio.dataset.trackId !== track.id) {
      audio.dataset.trackId = track.id;

      // Revoke the previous blob URL if there was one.
      if (revokePreviousBlobRef.current) {
        URL.revokeObjectURL(revokePreviousBlobRef.current);
        revokePreviousBlobRef.current = null;
      }

      setCurrentTime(0);
      setFailed(false);

      // Check the browser cache first — if the track was saved for offline
      // playback, `resolveAudioSrc` returns a blob: URL that reads from local
      // storage with zero network latency.
      void resolveAudioSrc(track.audio_url).then((src) => {
        // Guard: another track may have been loaded while we awaited.
        if (audio.dataset.trackId !== track.id) {
          if (src.startsWith('blob:')) URL.revokeObjectURL(src);
          return;
        }

        if (src.startsWith('blob:')) revokePreviousBlobRef.current = src;
        audio.src = src;
        audio.load();
        if (autoplay) startAudio(audio);
      });
    } else if (autoplay) {
      startAudio(audio);
    }
  }, [startAudio]);

  // Load whichever track is current. Keyed on the id, not the object: the queue
  // array is rebuilt on every shuffle toggle, and re-running this on identity
  // change would restart the track under the user.
  //
  // Still needed even though `play`, `playShuffled` and `jumpTo` all load eagerly:
  // `next()`, `previous()` and `ended` move the cursor through `advance()` without
  // knowing the destination, so for those this effect is the load.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !current) return;
    if (audio.dataset.trackId === current.id) return;
    loadTrack(current, wantPlayRef.current);
  }, [current, loadTrack]);

  // Element events. Re-attached when `repeat`/`advance` change so `ended` always
  // closes over the current mode.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    let sinceSave = 0;

    const onTime = () => {
      setCurrentTime(audio.currentTime);
      // Persist roughly every 5s rather than 4x/second.
      if (++sinceSave >= 20) {
        sinceSave = 0;
        try {
          if (current) {
            localStorage.setItem(
              LAST_KEY,
              JSON.stringify({ track: current, position: audio.currentTime }),
            );
          }
        } catch {
          // Storage full or blocked; resume position is a nicety.
        }
      }
    };

    const onMeta = () => {
      setDuration(Number.isFinite(audio.duration) ? audio.duration : 0);
      const pending = pendingSeekRef.current;
      if (pending !== null) {
        pendingSeekRef.current = null;
        // Fails silently if the CDN doesn't honour Range requests — see the
        // stream-proxy note in the README.
        audio.currentTime = pending;
      }
    };

    const onEnded = () => {
      if (repeat === 'one') {
        audio.currentTime = 0;
        startAudio(audio);
        return;
      }
      advance(1);
    };

    const onPlay = () => setIsPlaying(true);
    const onPause = () => {
      setIsPlaying(false);
      // Pausing mid-buffer ends the wait as far as the UI is concerned.
      setStalled(false);
    };

    /**
     * `waiting` covers both starts and mid-track rebuffers; `stalled` fires when
     * the network has gone quiet for long enough that the browser gives up
     * expecting data. `playing` is the only reliable all-clear -- `canplay` can
     * arrive while the element is still not advancing.
     */
    const onWaiting = () => setStalled(true);
    const onPlaying = () => {
      setStalled(false);
      setFailed(false);
    };
    const onError = () => {
      setStalled(false);
      setFailed(true);
      setIsPlaying(false);
    };

    audio.addEventListener('timeupdate', onTime);
    audio.addEventListener('loadedmetadata', onMeta);
    audio.addEventListener('durationchange', onMeta);
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('play', onPlay);
    audio.addEventListener('pause', onPause);
    audio.addEventListener('waiting', onWaiting);
    audio.addEventListener('stalled', onWaiting);
    audio.addEventListener('playing', onPlaying);
    audio.addEventListener('error', onError);

    return () => {
      audio.removeEventListener('timeupdate', onTime);
      audio.removeEventListener('loadedmetadata', onMeta);
      audio.removeEventListener('durationchange', onMeta);
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('pause', onPause);
      audio.removeEventListener('waiting', onWaiting);
      audio.removeEventListener('stalled', onWaiting);
      audio.removeEventListener('playing', onPlaying);
      audio.removeEventListener('error', onError);
    };
  }, [advance, current, repeat, startAudio]);

  const play = useCallback(
    (tracks: TrackView[], startIndex = 0) => {
      if (tracks.length === 0) return;
      const start = Math.min(Math.max(startIndex, 0), tracks.length - 1);

      wantPlayRef.current = true;
      pendingSeekRef.current = null;
      setQueue(tracks);

      if (shuffle) {
        // The clicked track still plays first; the rest of the album is shuffled
        // behind it. Starting a shuffled queue on a random track instead would
        // ignore what the user actually clicked.
        setOrder(shuffledOrder(tracks.length, start));
        setPosition(0);
      } else {
        setOrder(Array.from({ length: tracks.length }, (_, i) => i));
        setPosition(start);
      }

      // Load inside the click rather than waiting for the state above to commit
      // and the effect to notice. Two things fall out of that: the first byte is
      // requested a render earlier, which is worth having against a store whose
      // TTFB is ~1s, and clicking the track that is *already* loaded (paused, or
      // restored from localStorage) still starts it — `current` does not change
      // there, so the effect would never fire and the click would look ignored.
      loadTrack(tracks[start], true);
    },
    [loadTrack, shuffle],
  );

  /**
   * Shuffle-play a list without needing the shuffle toggle flipped first.
   *
   * A separate action rather than `toggleShuffle()` then `play()`: those two
   * would read the pre-toggle value of `shuffle` in the same handler, and the
   * queue would come out in album order with the button showing shuffle on.
   */
  const playShuffled = useCallback(
    (tracks: TrackView[]) => {
      if (tracks.length === 0) return;
      const start = Math.floor(Math.random() * tracks.length);

      wantPlayRef.current = true;
      pendingSeekRef.current = null;
      setQueue(tracks);
      setOrder(shuffledOrder(tracks.length, start));
      setPosition(0);
      setShuffle(true);

      loadTrack(tracks[start], true);
    },
    [loadTrack],
  );

  const toggle = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || !current) return;
    if (audio.paused) {
      wantPlayRef.current = true;
      startAudio(audio);
    } else {
      wantPlayRef.current = false;
      audio.pause();
    }
  }, [current, startAudio]);

  const next = useCallback(() => {
    wantPlayRef.current = true;
    advance(1);
  }, [advance]);

  const previous = useCallback(() => {
    const audio = audioRef.current;
    // The convention every player shares: within the first few seconds, "back"
    // means the previous track; after that it means restart this one.
    if (audio && audio.currentTime > 3) {
      audio.currentTime = 0;
      setCurrentTime(0);
      return;
    }
    wantPlayRef.current = true;
    advance(-1);
  }, [advance]);

  /**
   * Jump straight to a slot of the play order — what a click in the queue panel
   * means.
   *
   * Deliberately *not* `play(queue, order[orderPosition])`: that re-enters
   * `play()`'s `if (shuffle)` branch and reshuffles everything after the clicked
   * track, so the queue the user was looking at rearranges itself under the
   * click. `setPosition` is the whole mechanism, exactly as `next()` uses it.
   */
  const jumpTo = useCallback(
    (orderPosition: number) => {
      if (orderPosition < 0 || orderPosition >= order.length) return;
      wantPlayRef.current = true;

      if (orderPosition === position) {
        // Same slot: `current` never changes, so the load effect will not fire
        // and this would otherwise be a dead click. Resume instead — and return
        // *before* the `pendingSeekRef` line below, so a track restored from
        // localStorage still starts at its saved offset rather than at zero.
        const audio = audioRef.current;
        if (audio?.paused) startAudio(audio);
        return;
      }

      // A jump taken right after a restore must not apply the restored offset to
      // whichever track is being jumped to.
      pendingSeekRef.current = null;
      setPosition(orderPosition);

      // And point the element at it now, in the click, rather than a render later.
      const track = queue[order[orderPosition]];
      if (track) loadTrack(track, true);
    },
    [loadTrack, order, position, queue, startAudio],
  );

  const seek = useCallback((seconds: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    const limit = Number.isFinite(audio.duration) ? audio.duration : seconds;
    const clamped = Math.min(Math.max(seconds, 0), limit);
    audio.currentTime = clamped;
    // Set optimistically so a dragged scrubber tracks the pointer instead of
    // waiting for the next `timeupdate`.
    setCurrentTime(clamped);
  }, []);

  /**
   * Relative seek, reading the element's own clock rather than React state.
   *
   * This is what lets `currentTime` leave `PlayerApi` — the keyboard shortcuts in
   * `PlayerBar` were the only other reader, and they wanted "five seconds from
   * here", not the number itself. It is also strictly more accurate: state is
   * sampled four times a second, the element is exact.
   */
  const seekBy = useCallback(
    (delta: number) => {
      const audio = audioRef.current;
      if (!audio) return;
      seek(audio.currentTime + delta);
    },
    [seek],
  );

  const setVolume = useCallback((value: number) => {
    const clamped = Math.min(1, Math.max(0, value));
    setVolumeState(clamped);
    // Dragging up from zero is an unmute in every player people already use.
    if (clamped > 0) setMuted(false);
  }, []);

  const toggleMute = useCallback(() => setMuted((prev) => !prev), []);

  const cycleRepeat = useCallback(() => {
    setRepeat((prev) => (prev === 'off' ? 'all' : prev === 'all' ? 'one' : 'off'));
  }, []);

  /**
   * Rebuild the play order, keeping the cursor on the *same track* rather than
   * the same slot — flipping shuffle mid-song must never change what is playing.
   */
  const toggleShuffle = useCallback(() => {
    const nowOn = !shuffle;
    const playing = order[position];
    setShuffle(nowOn);
    if (playing === undefined) return;

    const nextOrder = nowOn
      ? shuffledOrder(queue.length, playing)
      : Array.from({ length: queue.length }, (_, i) => i);
    setOrder(nextOrder);
    setPosition(nextOrder.indexOf(playing));
  }, [order, position, queue.length, shuffle]);

  const enqueue = useCallback(
    (track: TrackView) => {
      if (queue.some((entry) => entry.id === track.id)) return;
      // Appended to the end of `order`, shuffled or not: "add to queue" means
      // last, and re-shuffling to place it would move everything else around.
      setOrder((prev) => [...prev, queue.length]);
      setQueue([...queue, track]);
    },
    [queue],
  );

  // Save the current track as soon as it changes, so a tab closed mid-song comes
  // back to the right row. `pendingSeekRef` is preferred over the element's own
  // `currentTime` because on a fresh restore the element is still at 0 and the
  // saved position has not been applied yet — reading the element would erase it.
  useEffect(() => {
    if (!current) return;
    try {
      localStorage.setItem(
        LAST_KEY,
        JSON.stringify({
          track: current,
          position: pendingSeekRef.current ?? audioRef.current?.currentTime ?? 0,
        }),
      );
    } catch {
      // Same as the periodic save: a nicety, never a failure.
    }
  }, [current]);

  // OS-level media controls: lock screen, notification shade, keyboard media
  // keys, Bluetooth headset buttons. All of it comes from these two effects.
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;
    if (!current) return;

    navigator.mediaSession.metadata = new MediaMetadata({
      title: current.title,
      artist: current.artist_name,
      album: current.album_title ?? undefined,
      // No `sizes` or `type`: we don't know either, and a wrong hint is worse
      // than none — Chrome will use the image regardless.
      artwork: current.album_cover_url ? [{ src: current.album_cover_url }] : undefined,
    });
  }, [current]);

  useEffect(() => {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;
    const session = navigator.mediaSession;
    session.playbackState = isPlaying ? 'playing' : 'paused';

    const actions: [MediaSessionAction, MediaSessionActionHandler][] = [
      [
        'play',
        () => {
          wantPlayRef.current = true;
          const audio = audioRef.current;
          if (audio) startAudio(audio);
        },
      ],
      [
        'pause',
        () => {
          wantPlayRef.current = false;
          audioRef.current?.pause();
        },
      ],
      ['nexttrack', () => next()],
      ['previoustrack', () => previous()],
      [
        'seekto',
        (details) => {
          if (typeof details.seekTime === 'number') seek(details.seekTime);
        },
      ],
    ];

    for (const [action, handler] of actions) {
      try {
        session.setActionHandler(action, handler);
      } catch {
        // Browsers throw rather than no-op on an action they don't implement.
      }
    }

    return () => {
      for (const [action] of actions) {
        try {
          session.setActionHandler(action, null);
        } catch {
          // Nothing to unwind if it was never accepted.
        }
      }
    };
  }, [isPlaying, next, previous, seek, startAudio]);

  /**
   * The next few tracks in play order, for predictive prefetching. Up to three
   * ahead, respecting repeat-all wrapping. The tracks that `advance(1)` would
   * eventually reach, in the order they would be reached.
   */
  const upcomingTracks = useMemo<TrackView[]>(() => {
    if (order.length === 0) return [];
    const tracks: TrackView[] = [];
    const seen = new Set<string>();
    for (let i = 1; i <= 3; i++) {
      let slot = position + i;
      if (slot >= order.length) {
        if (repeat !== 'all') break;
        slot = slot % order.length;
      }
      const idx = order[slot];
      if (idx === undefined) break;
      const track = queue[idx];
      if (track && !seen.has(track.id)) {
        seen.add(track.id);
        tracks.push(track);
      }
    }
    return tracks;
  }, [order, position, queue, repeat]);

  /**
   * Ref that stays in sync with the latest `upcomingTracks` without being a
   * direct dependency of the prefetch effect — the effect keys off
   * `prefetchKey` for stability, and reads the ref inside the timer callback.
   */
  const upcomingRef = useRef(upcomingTracks);
  upcomingRef.current = upcomingTracks;

  /**
   * Stable key derived from the upcoming track IDs, so the prefetch effect
   * only re-triggers when the *content* changes, not when React builds a new
   * array wrapper from the same data.
   */
  const prefetchKey = upcomingTracks.map((t) => t.id).join(',');

  /**
   * Predictive prefetch: download upcoming tracks into the Cache API while the
   * current one plays, so `resolveAudioSrc` returns a `blob:` URL at transition
   * time — no network request, no TTFB, instant playback.
   *
   * This replaces the previous `new Audio()` warm strategy. That approach filled
   * the browser's HTTP disk cache, but `resolveAudioSrc` still fell back to the
   * original URL and the `<audio>` element still negotiated range requests over
   * the network. The Cache API path is strictly better: the file becomes a local
   * blob and playback starts in the time it takes to parse the container header.
   *
   * Multiple tracks are prefetched (up to 3 on a fast connection, 1 on 3G, 0 on
   * 2G) so that rapid skips also hit the cache. Downloads are sequential — N+1
   * first, then N+2 — so a slow link still finishes the most important one.
   *
   * Started `PREFETCH_AFTER_MS` into the current track so it competes with
   * nothing: by then the playing track has its own buffer and the connection to
   * the host is already open.
   */
  useEffect(() => {
    if (!isPlaying || !prefetchKey) return;
    if (repeat === 'one') return;

    const timer = window.setTimeout(() => {
      const tracks = upcomingRef.current;
      if (tracks.length === 0) return;
      const targets = tracks.map((t) => ({
        trackId: t.id,
        audioUrl: t.audio_url,
        coverUrl: t.album_cover_url,
      }));
      void prefetchAhead(targets);
    }, PREFETCH_AFTER_MS);

    // Only the timer is unwound. An in-flight prefetch is left to finish —
    // pausing is not a reason to throw away bytes already paid for. A *new*
    // set of targets (different `prefetchKey`) cancels the previous run
    // inside `prefetchAhead` before starting its own.
    return () => window.clearTimeout(timer);
    // `upcomingRef` is read inside the timer, not here — `prefetchKey` is
    // the stable derivative that controls re-triggering.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying, repeat, prefetchKey]);

  const value = useMemo<PlayerApi>(
    () => ({
      queue,
      current,
      currentIndex,
      order,
      position,
      isPlaying,
      stalled,
      failed,
      // Before `loadedmetadata` lands, fall back to the duration the database
      // already knows, so the scrubber has a length on the very first paint.
      duration: duration || current?.duration_seconds || 0,
      volume,
      muted,
      shuffle,
      repeat,
      play,
      playShuffled,
      toggle,
      next,
      previous,
      jumpTo,
      seek,
      seekBy,
      setVolume,
      toggleMute,
      toggleShuffle,
      cycleRepeat,
      enqueue,
    }),
    [
      queue,
      current,
      currentIndex,
      order,
      position,
      isPlaying,
      stalled,
      failed,
      duration,
      volume,
      muted,
      shuffle,
      repeat,
      play,
      playShuffled,
      toggle,
      next,
      previous,
      jumpTo,
      seek,
      seekBy,
      setVolume,
      toggleMute,
      toggleShuffle,
      cycleRepeat,
      enqueue,
    ],
  );

  return (
    <PlayerContext.Provider value={value}>
      <PlayerTimeContext.Provider value={currentTime}>
        {children}
        {/* preload="metadata": enough for a duration, without pulling a 60MB FLAC
            that may never be played. */}
        <audio ref={audioRef} preload="metadata" />
      </PlayerTimeContext.Provider>
    </PlayerContext.Provider>
  );
}
