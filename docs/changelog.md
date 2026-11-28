# Changelog

What changed in the app, newest first. Before 2026-10-25 the entries are taken
from commit messages; commits titled only "updates" are not listed (see `git log`).

## 2026-11-28

**Data server: a program of its own, MicroMatic Server**
- The data server of the ML Training window left this repository. It is MicroMatic Server, a separate proprietary program in a checkout of its own; the window talks to it over HTTP as before.
- `deno task launch` and the `MicroMatic` entry start it from `../MicroMatic_Server` (another folder: `MICROMATIC_S_PATH__SERVER`, or `--server-root`) and run its `deno task install` first. Without it they start the application alone and say so. `deno task install` runs its installer the same way, or skips it (`micromatic_server.module.js`).
- The tasks `dataserver` and `install_ml` are gone; `test_dataserver` is now `test_ml` with the tests of the window only. The ML Training window test takes the data server from the server checkout and is ignored without one.
- YOLO11n (Ultralytics, AGPL-3.0) is no longer offered; the default base model is RF-DETR Nano.
- `dataserver/data/`, `dataserver/log/` and `venv_yolo/` stay git-ignored until they are moved to MicroMatic Server.

## 2026-11-26

**Detection libraries: a python that is new enough**
- `./venv_yolo` is created with the first `python3` of the PATH that is new enough for the detection libraries (`a_n_version__python__min` in `dataserver/install_ml.js`). Before, it was created with the first `python3` of the PATH whatever its version: with an older Anaconda in front of the python of the system only Ultralytics could be installed, and YOLOX and RF-DETR stayed "not installed".
- An environment built on a python that is too old is built again by the next `deno task start`; `deno task doctor` names it.

**Login: predefined accounts**
- In front of the login fields a list offers the accounts of the people who test the application: organisation `alpha_testers` with `jonas_frey`, `katja_habegger`, `manuel_franzini` and `petra_zahajska`. Choosing one logs it in. The list is `A_O_ORGANISATION__PREDEFINED` in `webserved_dir/o_ml.module.js`; organisation and person are created by their first login. Draft, not in a drawing yet.

## 2026-11-23

**ML Training: the model that is fine-tuned**
- The model row says exactly what "train" fine-tunes: a list to choose the base model, and under it the pretrained weights, their publisher, what they were trained on, the size of the network, the image size and the library with its installed version. The status of a training and the list of models name the base model too.
- New base models next to YOLO11n: YOLOX-S (Megvii) and RF-DETR Nano, Small and Medium (Roboflow). Their libraries are installed into `./venv_yolo`; until then they are listed as "not installed" and cannot be trained.
- The detection libraries install themselves: `deno task start`, `deno task install` and the `MicroMatic` entry of the desktop install what is missing, `deno task doctor` reports it. With everything in place the check takes a fraction of a second. `deno task install_ml` (before: `install_yolo`) is the step on its own; `deno task install --skip-ml` leaves it out.
- Data server: `GET /api/model_base`, `s_name__model_base` in the train request, the job and the model (see `dataserver/readme_mgc.md`).
- YOLOX-S and RF-DETR train on small copies of the images, written once per training: a 3840×2160 PNG decoded in full for every step kept the graphics card waiting. RF-DETR Nano, 50 epochs on 79 images: 5 min instead of 10. The working folder of an RF-DETR training no longer grows by half a GB every 10 epochs.

## 2026-11-14

**AI tools moved to branch `_experimental_ki_tools`**
- Removed from main: Cell pose window (Cellpose), Train model window (annotation, training data capture, SAM masks, YOLO training/inference), their server routes, workers, tests and feature notes.
- `deno task install` no longer sets up `venv_cellpose`; `--skip-cellpose`, `--cpu` and `deno task install-yolo` are gone. Existing `venv_cellpose/`, `venv_yolo/`, `training_data/` folders stay on disk and stay git-ignored.
- AI-based stitching (LightGlue, LoFTR) is unchanged.

## 2026-11-10

**Auto move**
- Rectangle loop can show drift: with **Overlay** above 0, a snapshot is taken with the stage at rest at the start and after every cycle, and the average of all snapshots lies half transparent over the live image. A stage that returns exactly gives a sharp overlay, a drifting one a trail of ghost copies. The slider sets the transparency, the bin removes the snapshots; they are kept in memory only.
- Rectangle only: the circle never stops at a fixed point while it loops, so it takes no snapshots.

**Camera**
- The Camera and Image Filter windows are one **Camera** window: camera settings on top, then the live histogram, exposure markers and image filter. Tools lists it once, as Camera.
- Resolution lists the real sensor sizes of the connected camera (read on the server with `v4l2-ctl`, see readme) instead of a fixed list, and always shows the size the camera is delivering. Choosing one switches the sensor itself; the browser may no longer keep another size and scale it. Without `v4l2-ctl` the old fixed list is offered.
- New **ISO** slider (the camera's gain). The browser cannot reach it, so it is set on the server with `v4l2-ctl` and only shown on Linux. It is saved and restored like the other camera settings. Needs an app server restart.
- `deno task start` installs `v4l2-ctl` on Linux when it is missing (see readme).
- Manual exposure has a fine tune slider under the exposure time: the list picks the coarse time, the slider lengthens or shortens it up to halfway to the neighbouring entry. The resulting time is shown in ms.
- The header shows the live camera frame size. Filter reset and on/off sit on the Image filter line.
- Layout is a functional draft until the window is drawn (`docs/features/hgc_ui/readme_hgc.md`).

**Size** (notes: `docs/features/hgc_size/notes_mgc.md`)
- New **Size** window with three tabs. It replaces the old Scale window.
- Calibrate: click two points a known distance apart on the live image (for example one cell of a 0.1 mm grid slide), type the distance in mm or µm, save. A magnifier follows the cursor; placed points can be dragged.
- Calibrate keeps a snapshot: the camera image from the moment the second point is set is saved with the measured line drawn in (`scans/size_calibration/`). Its thumbnail sits under the stored scale; click it to open the full image. Needs an app server restart.
- Measure: click points on the live image; every line shows its length and the last point the total. Drag a point to move it, click it to remove it.
- Reference: grid, ruler, or an object of typical size (human hair, red blood cell, …) or an own picture, semi-transparent over the live image. They stay on while the window is closed and get a switch-off icon in the top bar.
- Measure and Reference need a stored scale. A scale stored for another camera resolution is not used and the window says so.
- The Calibration window is now **Flat field** only.

**Fixed**
- Marking calibration points on the live image no longer moves the stage (the clicks used to reach mouse movement).

**Cockpit UI pass** (rules: `docs/features/hgc_ui/cockpit_rules.md`)
- No window scrolls any more at 1366 × 768 and larger. Only data lists scroll inside their own area (scans, saved training captures, recordings, macro commands, logs).
- Large windows have pictogram tabs, one pane per function: Scan → Area / Focus / Stitch / Scans; Training → Data / Stage / Draw / Model / Saved. Start scan and Capture stay in a fixed footer.
- Explanations moved out of the windows into tooltips. Hover (or focus) a field, a button or an **i** pictogram to read them. Every plain `title` now shows as the same instant tooltip.
- Every window header carries the pictogram of its tool, plus its state and quick actions (Filter on/off + reset, Statistics reset, Recordings refresh, Motion detection switch).
- Search (Ctrl+Shift+P) switches to the pane that holds the found control.
- Statistics is one table (a column per motor). Recordings is one line per session; the player opens for the selected one. Slide library shows projects and slides side by side.
- Auto stitch and Focus step have their own pictograms.
- Speed presets: Z focus is now 1 / 3 / 9 RPM for Slow / Normal / Fast (was 0.15 / 0.5 / 1.5). XY is unchanged.

**Removed** (moved to `archive/hub_panels/`)
- Motion and Optics windows: they only opened other windows, which Tools already does.
- Scan and AStitch buttons at the bottom of the Map window (same reason); the Scan button stays when a slide has no map yet.
- "Recapture" in Scale (Capture does the same).
- Camera settings button and Setup link in Quick settings. Camera is opened from Tools (or its pinned shortcut) only; the hardware line in Quick settings is now a read-only status.

## 2026-10-25

**Calibration**
- X/Y auto-calibrate (one button per axis in Setup) now measures over a long travel and waits until the image stops moving, so it works on drives that stick and then jump. It sets steps per pixel and backlash.
- It saves nothing, and says why, when the image did not move, the view has too little detail, or the two directions disagree.
- Progress and result show in the Setup status line below the axis rows.
- Setup X/Y rows show steps per pixel (**st/px**) and accept a typed value.

**Fixed**
- Motors no longer stop briefly once per second during long moves. The status reply blocked the firmware loop for ~70 ms; both serial ports now have a transmit buffer. Needs a re-flash. Details: `docs/features/hgc_usb_connection/usb_connection.md`.
- Free outline scan planned a single row: a bad saved Y calibration (17.21 st/px instead of ~0.03) squashed the outline. The new calibration refuses such values. Details: `docs/features/hgc_image_stitching/24-10-2026_freeoutline_problem/summary_mgc.md`.

**Removed** (moved to `archive/`)
- Setup "Motor tests & calibration": Calibrate all, motor cards with test moves, Steps, Stop all, Refresh, advanced calibration settings and results.
- Calibration checklist.
- "Manual movement" block in Setup. Speed and mouse movement stay in the toolbar; directions follow the Reverse buttons.
- Flat-field and Hardware crop panels (no longer reachable).

**Other**
- Flash button tooltip shows the compiler version.

## 2026-10-24
- Manual stitch panel removed.

## 2026-10-21
- Calibration overlay (scale, flat-field) added; camera settings reworked.

## 2026-10-09
- Free outline scan: scan an area outlined by focused points, with interpolated focus.

## 2026-09-28
- Live stitching (archived later).

## 2026-09-21
- Video recording, timelapse, zoom.

## 2026-09-16
- Calibration hub with checklist; scale (µm/pixel) tool; focus step / depth-of-field calibration; Test X / Test Y in the scan panel.

## 2026-09-15
- Flat-field (dust removal) correction.

## 2026-09-14
- OMM v1.0.0, first release.
