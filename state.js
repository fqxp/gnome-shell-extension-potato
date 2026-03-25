import GLib from "gi://GLib";
import Gio from "gi://Gio";

export class StateManager {
  constructor() {
    this._dir = GLib.build_filenamev([GLib.get_user_data_dir(), "potato"]);
    this._path = GLib.build_filenamev([this._dir, "state.json"]);
  }

  save(data) {
    try {
      GLib.mkdir_with_parents(this._dir, 0o755);
      const json = JSON.stringify(data, null, 2);
      GLib.file_set_contents(this._path, json);
    } catch (e) {
      logError(e, "potato: failed to save state");
    }
  }

  load() {
    try {
      if (!GLib.file_test(this._path, GLib.FileTest.EXISTS)) return null;
      const [ok, contents] = GLib.file_get_contents(this._path);
      if (!ok) return null;
      const decoder = new TextDecoder("utf-8");
      return JSON.parse(decoder.decode(contents));
    } catch (e) {
      logError(e, "potato: failed to load state");
      return null;
    }
  }

  clear() {
    try {
      if (GLib.file_test(this._path, GLib.FileTest.EXISTS))
        GLib.unlink(this._path);
    } catch (e) {
      logError(e, "potato: failed to clear state");
    }
  }
}
