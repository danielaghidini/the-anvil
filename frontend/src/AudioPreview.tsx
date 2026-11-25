import { useRef, useState } from 'react';
import { Pause, Play, Volume2 } from 'lucide-react';

export function AudioPreview({ src, compact = false }: { src: string; compact?: boolean }) {
  const audio = useRef<HTMLAudioElement>(null),
    [playing, setPlaying] = useState(false),
    [time, setTime] = useState(0),
    [duration, setDuration] = useState(0),
    [volume, setVolume] = useState(1),
    [error, setError] = useState('');
  const format = (seconds: number) => {
    const value = Math.floor(Number.isFinite(seconds) ? seconds : 0);
    return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, '0')}`;
  };
  async function toggle() {
    const player = audio.current;
    if (!player) return;
    if (!player.paused) {
      player.pause();
      return;
    }
    try {
      setError('');
      await player.play();
    } catch {
      setError('Could not play audio.');
    }
  }
  return (
    <div className={`idle-audio-preview${compact ? ' is-compact' : ''}`}>
      <audio
        ref={audio}
        src={src}
        preload="metadata"
        onLoadedMetadata={(e) =>
          setDuration(Number.isFinite(e.currentTarget.duration) ? e.currentTarget.duration : 0)
        }
        onDurationChange={(e) =>
          setDuration(Number.isFinite(e.currentTarget.duration) ? e.currentTarget.duration : 0)
        }
        onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onError={() => setError('Could not load audio.')}
      />
      <button
        type="button"
        className="idle-audio-play"
        aria-label={playing ? 'Pause audio' : 'Play audio'}
        onClick={() => void toggle()}
      >
        {playing ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" />}
      </button>
      <span className="idle-audio-time">
        {format(time)} / {format(duration)}
      </span>
      <input
        className="idle-audio-seek"
        type="range"
        min="0"
        max={duration || 0}
        step="0.01"
        value={Math.min(time, duration)}
        aria-label="Audio progress"
        disabled={!duration}
        onChange={(e) => {
          const value = Number(e.target.value);
          if (audio.current) audio.current.currentTime = value;
          setTime(value);
        }}
      />
      {!compact && <Volume2 size={17} className="idle-audio-volume-icon" aria-hidden="true" />}
      {!compact && (
        <input
          className="idle-audio-volume"
          type="range"
          min="0"
          max="1"
          step="0.01"
          value={volume}
          aria-label="Audio volume"
          onChange={(e) => {
            const value = Number(e.target.value);
            if (audio.current) audio.current.volume = value;
            setVolume(value);
          }}
        />
      )}
      {error && (
        <span className="idle-audio-preview-error" role="alert">
          {error}
        </span>
      )}
    </div>
  );
}
