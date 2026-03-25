import Gio from "gi://Gio";
import GLib from "gi://GLib";

let GSound = null;
try {
  GSound = (await import("gi://GSound")).default;
} catch {
  // GSound not available, will use subprocess fallback
}

export function createSoundPlayer(extensionDir) {
  return new SoundPlayer(extensionDir);
}

class SoundPlayer {
  constructor(extensionDir) {
    this._dir = extensionDir;
    this._gsound = null;

    if (GSound) {
      try {
        this._gsound = new GSound.Context();
        this._gsound.init(null);
      } catch {
        this._gsound = null;
      }
    }
  }

  _getSoundPath(name) {
    return GLib.build_filenamev([this._dir, "sounds", `${name}.ogg`]);
  }

  play(name) {
    const path = this._getSoundPath(name);

    if (this._gsound) {
      try {
        this._gsound.play_simple(
          null,
          "media.filename",
          path,
          "media.role",
          "event",
        );
        return;
      } catch {
        // fallback below
      }
    }

    this._playSubprocess(path);
  }

  _playSubprocess(path) {
    const players = ["paplay", "ogg123", "canberra-gtk-play"];
    for (const player of players) {
      try {
        const args =
          player === "canberra-gtk-play"
            ? [player, "-f", path]
            : [player, path];
        const proc = Gio.Subprocess.new(
          args,
          Gio.SubprocessFlags.STDERR_SILENCE |
            Gio.SubprocessFlags.STDOUT_SILENCE,
        );
        proc.wait_async(null, () => {});
        return;
      } catch {
        continue;
      }
    }
    logError(new Error("No sound player found"), "Potato");
  }
}
