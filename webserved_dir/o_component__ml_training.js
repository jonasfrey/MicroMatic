import { o_state, f_save_setting__debounced, f_n_motor__axis } from './index.js';
import { o_actions } from './o_actions.js';
import { o_component__icon } from './o_component__icon.js';
import { o_component__ml_stage } from './o_component__ml_stage.js';
import { o_component__ml_library } from './o_component__ml_library.js';
import { o_component__ml_slide } from './o_component__ml_slide.js';
import { o_component__smart_selector } from './o_component__smart_selector.js';
import { f_a_v__moved, f_s_date_time } from './smart_selector.module.js';
import {
    o_ml,
    N_BYTE__FREE_WARN,
    A_O_ORGANISATION__PREDEFINED,
    f_save_config,
    f_camera_changed,
    f_o_calibration__local,
    f_o_dataset__current,
    f_a_s_reason__capture,
    f_login,
    f_logout,
    f_select_dataset,
    f_refresh_dataset_list__quiet,
    f_create_dataset,
    f_rename_dataset,
    f_delete_dataset,
    f_create_class,
    f_update_class,
    f_delete_class,
    f_n_cnt__bbox__of_class,
    f_reorder_class,
    f_b_view__held,
    f_discard_bbox__camera,
    f_close_still,
    f_save_bbox__now,
    N_CNT__FOCUS_MAX,
    f_n_step__focus,
    f_set_cnt__focus,
    f_set_focus,
    f_reset_focus,
    f_capture,
    f_cancel_capture,
    f_set_done,
    f_s_url__thumbnail,
    f_export,
    f_b_job__active,
    f_o_model_base,
    f_train,
    f_cancel_train,
    f_upload_model,
    f_select_model,
    f_rename_model,
    f_delete_model,
    f_detect,
    f_watch_session,
} from './o_ml.module.js';

// ML Training: annotate what the camera shows, export the dataset, train a
// model and apply it. Unlike every other window this one is docked to the
// right edge: the image keeps the rest of the screen and nothing lies on it.
//
// Layout after the drawings 2026-11-19-pda_ui_mockup_ml_training,
// ..._ml_training_box_edit and ..._ml_training_live_annotation: dataset,
// microscope and objective, classes with keys 1-9, the image captured last,
// focus points, capture, export; µm per px, px per step, slide, organisation
// and person in the top bar.
// Boxes are drawn on the live image (o_component__ml_stage.js). From the first
// box on X and Y stay where they are; "capture" stores the camera image with
// its boxes. Whoever moves X or Y before that is asked whether the boxes may go.
// Slide, organisation and person stay in the top bar while the window is closed.
// A capture with several focus points takes a while: the middle of the live
// image says which focus point is being taken, no motor can be moved by hand,
// and "cancel" stops it without keeping an image.
// Draft, not in a drawing yet: the model row with the base model that is
// fine-tuned and the epochs, "live" / "done"
// for a stored image opened from the image list, the message in the middle
// of the image while a capture or a detection is running, and the list of
// predefined accounts in front of the login fields.

let o_component__ml_training = {
    name: 'component-ml-training',
    components: {
        ui_icon: o_component__icon,
        ml_stage: o_component__ml_stage,
        ml_library: o_component__ml_library,
        ml_slide: o_component__ml_slide,
        smart_selector: o_component__smart_selector,
    },
    template: `
        <teleport to="#toolbar-ml" defer>
            <template v-if="o_state.o_panel_visibility.ml_training">
                <button class="ml-chip" :class="{ empty: !o_calibration.n_um_per_px }" data-control-skip @click="f_open_panel('scale')"
                    aria-label="µm per px" :data-tooltip="'µm per px\\n' + (o_calibration.n_um_per_px ? 'Size of one image pixel. Stored with every image.' : 'Not calibrated for this camera image. Images are stored without it. Click to open the Size window.')">
                    <ui_icon s_name="scale" /><span>{{ s_um_per_px }}</span></button>
                <button class="ml-chip" :class="{ empty: !b_px_per_step }" data-control-skip @click="f_open_panel('setup')"
                    aria-label="px per step" :data-tooltip="'px per step, X · Y\\n' + (b_px_per_step ? 'Image pixels the picture moves per motor step. Stored with every image.' : 'Not calibrated. Images are stored without it. Click to open Setup.')">
                    <ui_icon s_name="motor" /><span>{{ s_px_per_step }}</span></button>
            </template>
            <ml_slide />
            <span class="ml-chip warning" v-if="o_ml.b_probed && !o_ml.b_reachable" data-tooltip="Data server offline&#10;Start it in a terminal with: deno task launch">
                <ui_icon s_name="database" /><span>offline</span></span>
            <template v-if="o_ml.o_person">
                <span class="ml-chip ml-chip--name" :data-tooltip="'Organisation · ' + o_ml.o_organisation.s_name + '\\nAll datasets, slides and models belong to it.'">
                    <ui_icon s_name="organisation" /><span>{{ o_ml.o_organisation.s_name }}</span></span>
                <span class="ml-chip ml-chip--name" :data-tooltip="'Logged in · ' + o_ml.o_person.s_name">
                    <ui_icon s_name="user" /><span>{{ o_ml.o_person.s_name }}</span></span>
                <button class="toolbar-toggle toolbar-icon" data-control-skip @click="f_logout" aria-label="Log out" data-tooltip="Log out"><ui_icon s_name="logout" /></button>
            </template>
            <form class="ml-login" v-else-if="o_ml.b_probed && o_ml.b_reachable" autocomplete="off" @submit.prevent="f_login">
                <label class="toolbar-select" data-tooltip="Account · draft&#10;The accounts of the people who test the application. Choosing one logs it in.">
                    <span aria-hidden="true">account</span><ui_icon s_name="user" /><ui_icon s_name="chevron" />
                    <select id="ml-login-account" data-control-skip aria-label="Account" :disabled="o_ml.s_activity !== ''" @change="f_login__predefined">
                        <option value="">account</option>
                        <optgroup v-for="o_organisation in A_O_ORGANISATION__PREDEFINED" :key="o_organisation.s_name" :label="o_organisation.s_name">
                            <option v-for="s_name__person in o_organisation.a_s_name__person" :key="s_name__person" :value="o_organisation.s_name + '/' + s_name__person">{{ s_name__person }}</option>
                        </optgroup>
                    </select>
                </label>
                <label class="ml-chip ml-chip--field" data-tooltip="Organisation&#10;1 to 40 characters: a-z, 0-9, _ and -&#10;A new name creates a new, empty organisation.">
                    <ui_icon s_name="organisation" />
                    <input id="ml-login-organisation" type="text" data-control-skip aria-label="Organisation" placeholder="organisation" v-model.trim="s_name__organisation" autocomplete="off" spellcheck="false" maxlength="40" />
                </label>
                <label class="ml-chip ml-chip--field" data-tooltip="Name&#10;1 to 40 characters: a-z, 0-9, _ and -">
                    <ui_icon s_name="user" />
                    <input id="ml-login-person" type="text" data-control-skip aria-label="Name" placeholder="name" v-model.trim="s_name__person" autocomplete="off" spellcheck="false" maxlength="40" />
                </label>
                <button class="toolbar-toggle toolbar-icon" type="submit" data-control-skip :disabled="!s_name__person || !s_name__organisation || o_ml.s_activity !== ''" aria-label="log in" data-tooltip="Log in"><ui_icon s_name="go" /></button>
            </form>
        </teleport>

        <section class="overlay-panel ml-dock" :class="{ visible: o_state.o_panel_visibility.ml_training }" aria-label="ML Training">
            <div class="ml-dock-header">
                <h2><ui_icon s_name="ml" /> ML Training</h2>
                <span class="panel-state running" v-if="o_ml.s_activity !== ''">{{ o_ml.s_activity }}</span>
                <button class="panel-close" @click="f_close" aria-label="Close ML Training">&times;</button>
            </div>
            <div class="ml-dock-body">
                <p class="cockpit-status error" role="alert" v-if="o_ml.b_probed && !o_ml.b_reachable"
                    data-tooltip="Data server offline&#10;Start it in a terminal with: deno task launch">data server offline</p>
                <p class="cockpit-status" role="status" v-else-if="o_ml.b_probed && !o_ml.o_person"
                    data-tooltip="Not logged in&#10;Enter organisation and name in the top bar.">not logged in</p>
                <p class="cockpit-status warning" role="status" v-else-if="b_disk_low"
                    data-tooltip="Disk space&#10;Below 1 GB the data server accepts no new image.">{{ s_byte__free }} free</p>

                <template v-if="o_ml.o_person">
                    <div class="cockpit-section">
                        <div class="cockpit-section-head">
                            <span class="cockpit-label ml-label"><ui_icon s_name="dataset" /> dataset</span>
                        </div>
                        <smart_selector class="ml-dataset" s_name__kind="dataset" :a_o_object="o_ml.a_o_dataset" :n_id="o_state.o_ml_config.n_id__dataset"
                            :a_o_field="a_o_field__dataset" :n_len__max="24" :s_tooltip="s_tooltip__dataset" :f_s_url__thumbnail="f_s_url__thumbnail__dataset"
                            :f_select="f_select_dataset" :f_b_create="f_b_create_dataset" :f_b_update="f_b_update_dataset" :f_delete="f_delete_dataset"
                            :f_refresh="f_refresh_dataset_list__quiet" />
                    </div>

                    <div class="cockpit-section">
                        <div class="cockpit-grid">
                            <div class="cockpit-field" data-tooltip="Microscope&#10;Manufacturer and model. Stored with every image.">
                                <label class="ml-label" for="ml-microscope"><ui_icon s_name="microscope" /> microscope</label>
                                <input id="ml-microscope" type="text" data-control-skip list="ml-microscope-list" maxlength="100"
                                    v-model="o_state.o_ml_config.s_name__microscope" @change="f_save_config" />
                            </div>
                            <div class="cockpit-field" data-tooltip="Objective&#10;Names the calibration, for example 10x. µm per px and px per step of the top bar are stored under this name, as far as they are measured; changed values become a new calibration.">
                                <label class="ml-label" for="ml-calibration"><ui_icon s_name="objective" /> objective</label>
                                <input id="ml-calibration" type="text" data-control-skip list="ml-calibration-list" maxlength="100"
                                    v-model="o_state.o_ml_config.s_name__calibration" @change="f_save_config" />
                            </div>
                        </div>
                        <datalist id="ml-microscope-list"><option v-for="s in a_s_name__microscope" :key="s" :value="s"></option></datalist>
                        <datalist id="ml-calibration-list"><option v-for="s in a_s_name__calibration" :key="s" :value="s"></option></datalist>
                    </div>

                    <div class="cockpit-section" v-if="o_dataset">
                        <div class="cockpit-section-head">
                            <span class="cockpit-label">classes</span>
                            <span class="ui-info" tabindex="0" role="note" data-tooltip="Classes&#10;Keys 1 to 9 choose the class of the next box and change the class of the box in edit mode."></span>
                        </div>
                        <div ref="el_class_list" class="ml-class-list cockpit-list">
                            <div class="ml-class" v-for="(o_class, n_idx) in o_ml.a_o_class" :key="o_class.n_id" :data-id="o_class.n_id"
                                :class="{ active: o_class.n_id === o_ml.n_id__class__active, moving: o_class.n_id === n_id__class__moving }" @click="o_ml.n_id__class__active = o_class.n_id">
                                <span class="ml-class-key">{{ n_idx < 9 ? n_idx + 1 : '' }}</span>
                                <input class="ml-class-color" type="color" data-control-skip :value="o_class.s_color_hex" :aria-label="'Colour of ' + o_class.s_name"
                                    @change="f_on_class_color(o_class, $event)" />
                                <input class="ml-class-name" type="text" data-control-skip :value="o_class.s_name" :aria-label="'Name of class ' + (n_idx + 1)" maxlength="50"
                                    @change="f_on_class_name(o_class, $event)" @keydown.enter="$event.target.blur()" />
                                <button class="cockpit-icon-button ml-class-order" data-control-skip @click.stop @pointerdown.stop.prevent="f_on_order_down(o_class, $event)"
                                    @keydown.up.prevent="f_move_class(o_class, -1)" @keydown.down.prevent="f_move_class(o_class, 1)"
                                    :aria-label="'Change order of class ' + o_class.s_name"
                                    data-tooltip="Change order&#10;Drag up or down, or press the arrow keys. The keys 1 to 9 follow the order."><ui_icon s_name="order" /></button>
                                <button class="cockpit-icon-button danger" @click.stop="f_delete_class(o_class)" :aria-label="'Delete class ' + o_class.s_name" data-tooltip="Delete this class"><ui_icon s_name="trash" /></button>
                            </div>
                            <div class="ml-class ml-class--new">
                                <span class="ml-class-key">{{ o_ml.a_o_class.length < 9 ? o_ml.a_o_class.length + 1 : '' }}</span>
                                <input class="ml-class-name" type="text" data-control-skip aria-label="New class name" placeholder="new class" maxlength="50"
                                    v-model="s_name__class__new" @keyup.enter="f_create_class" @blur="f_create_class" />
                            </div>
                        </div>
                    </div>

                    <div class="cockpit-section" v-if="o_dataset">
                        <div class="cockpit-section-head">
                            <span class="cockpit-label">images</span>
                            <span class="cockpit-readout" data-tooltip="Images&#10;done / all. Only images marked as done are exported and used for training. A captured image is done.">{{ o_dataset.n_cnt__image__done }}/{{ o_dataset.n_cnt__image }}</span>
                        </div>
                        <div class="ml-image-row">
                            <button class="ml-thumbnail" @click="o_ml.b_library = !o_ml.b_library" :disabled="!o_ml.a_o_image.length" aria-label="Images"
                                data-tooltip="Images&#10;The image captured last. Click to see all images of the dataset.">
                                <img v-if="s_url__thumbnail" :src="s_url__thumbnail" alt="" draggable="false" />
                                <ui_icon v-else s_name="image" />
                            </button>
                            <div class="ml-image-action">
                                <span class="cockpit-status" :class="{ running: o_ml.s_status__save === 'saving', error: o_ml.s_status__save === 'error', warning: b_view__held && o_ml.s_status__save !== 'error' }"
                                    role="status" :data-tooltip="b_view__held ? 'X and Y are locked\\nBoxes are drawn on this field of view. Capture stores them. Whoever moves X or Y before that is asked whether they may be lost.' : null">{{ s_status__stage }}</span>
                                <div class="cockpit-row cockpit-row--wrap">
                                    <button class="btn-small" v-if="o_ml.b_still" @click="f_close_still" :disabled="o_ml.s_activity !== ''" aria-label="live" data-tooltip="Live&#10;Back to the live image."><ui_icon s_name="video" /> live</button>
                                    <button class="btn-small" v-if="o_ml.o_image" :class="{ active: o_ml.o_image.b_done }" @click="f_toggle_done" :disabled="o_ml.s_activity !== ''" aria-label="done"
                                        data-tooltip="Done&#10;Only an image marked as done is exported and used for training."><ui_icon s_name="check" /> done</button>
                                    <button class="btn-small" v-if="o_ml.s_status__save === 'error'" @click="f_save_bbox__now" aria-label="retry">retry</button>
                                    <button class="cockpit-icon-button" v-if="o_ml.a_o_prediction.length" :class="{ active: o_ml.b_prediction }" @click="o_ml.b_prediction = !o_ml.b_prediction"
                                        aria-label="Show predictions" :aria-pressed="o_ml.b_prediction" data-tooltip="Show or hide the predictions"><ui_icon s_name="detection" /></button>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div class="cockpit-section" v-if="o_dataset">
                        <div class="cockpit-section-head">
                            <button class="ml-fold" data-control-skip @click="b_focus = !b_focus" :aria-expanded="b_focus" aria-label="Focus points"
                                data-tooltip="Focus points&#10;Experimental. Several focus points on one field of view: capture takes one image at each of them, all with the same boxes. With one point the image is taken where the focus is.">
                                <ui_icon s_name="chevron" /><span class="cockpit-label">focus points</span></button>
                            <input class="ml-focus-count" v-if="b_focus" type="number" data-control-skip min="1" :max="N_CNT__FOCUS_MAX" step="1" aria-label="Number of focus points"
                                :value="o_ml.n_cnt__focus" @change="f_on_focus_count" />
                            <span class="cockpit-readout" v-else-if="o_ml.n_cnt__focus > 1">{{ o_ml.n_cnt__focus }}</span>
                        </div>
                        <div class="ml-focus-list" v-if="b_focus && o_ml.n_cnt__focus > 1">
                            <div class="ml-focus" v-for="(n_step, n_idx) in o_ml.a_n_step__focus" :key="n_idx">
                                <span class="ml-focus-number">{{ n_idx + 1 }}</span>
                                <span class="cockpit-readout" :class="{ dim: n_step === null }">{{ n_step === null ? '—' : n_step }}</span>
                                <button class="btn-small" @click="f_set_focus(n_idx)" :disabled="n_step__focus === null || o_ml.s_activity !== ''" :aria-label="'Set focus point ' + (n_idx + 1)"
                                    :data-tooltip="'Set\\n' + (n_step__focus === null ? 'Connect the microcontroller: the position of the Z motor is not known.' : 'The focus as it is now becomes this focus point.')">set</button>
                            </div>
                        </div>
                    </div>

                    <div class="cockpit-section" v-if="o_dataset">
                        <button class="btn-small ml-capture" @click="f_capture" :disabled="b_capture_blocked" aria-label="capture" :data-tooltip="s_tooltip__capture"><ui_icon s_name="capture_image" /> capture</button>
                    </div>

                    <div class="cockpit-footer" v-if="o_dataset">
                        <button class="btn-small" @click="f_export" :disabled="o_ml.s_activity !== ''" aria-label="export"
                            data-tooltip="Export&#10;Download the images marked as done in YOLO format (tar)."><ui_icon s_name="download" /> export</button>
                        <div class="cockpit-section-head ml-head--model">
                            <span class="cockpit-label">model</span>
                            <span class="cockpit-readout dim" data-tooltip="Draft&#10;This part of the window is not drawn yet.">draft</span>
                        </div>
                        <smart_selector class="ml-model" s_name__kind="model" :a_o_object="o_ml.a_o_model" :n_id="o_state.o_ml_config.n_id__model"
                            :a_o_field="a_o_field__model" :n_len__max="24" :s_tooltip="s_tooltip__model" :f_s_detail="f_s_detail__model"
                            :f_select="f_select_model" :f_b_update="f_b_update_model" :f_delete="f_delete_model"
                            :f_create="f_pick_model_file" s_tooltip__create="Upload a YOLO .pt file trained elsewhere. Train makes a model from this dataset." />
                        <input ref="el_file__model" class="sr-only" type="file" accept=".pt" data-control-skip tabindex="-1" aria-label="Upload model" @change="f_on_model_file" />
                        <button class="btn-small" @click="f_detect" :disabled="!o_state.o_ml_config.n_id__model || o_ml.s_activity !== ''" aria-label="detect objects"
                            data-tooltip="Detect objects&#10;Apply the chosen model to the image. What it finds is shown dashed and is never saved. On the live image it goes as soon as X or Y moves."><ui_icon s_name="detection" /> detect objects</button>
                        <div class="cockpit-field" :data-tooltip="s_tooltip__model_base">
                            <label for="ml-model-base">fine-tune</label>
                            <select id="ml-model-base" data-control-skip aria-label="Model to fine-tune" :disabled="b_job_active"
                                v-model="o_state.o_ml_config.s_name__model_base" @change="f_save_config">
                                <option v-for="o_model_base in o_ml.a_o_model_base" :key="o_model_base.s_name" :value="o_model_base.s_name">{{ o_model_base.s_label }}{{ o_model_base.s_version__library ? '' : ' · not installed' }}</option>
                            </select>
                        </div>
                        <div class="cockpit-status ml-model-base" role="note" v-if="o_model_base">{{ s_detail__model_base }}</div>
                        <div class="cockpit-row">
                            <div class="cockpit-field ml-field--epoch" data-tooltip="Epochs&#10;How many times the training goes through all images.">
                                <label for="ml-epoch">epochs</label>
                                <input id="ml-epoch" type="number" data-control-skip min="1" max="1000" step="1" v-model.number="o_state.o_ml_config.n_epoch" @change="f_on_epoch_change" />
                            </div>
                            <button class="btn-small cockpit-grow" v-if="!b_job_active" @click="f_train" :disabled="o_ml.s_activity !== '' || !b_model_base__installed" aria-label="train"
                                :data-tooltip="s_tooltip__train"><ui_icon s_name="ml_brain_gear" /> train</button>
                            <button class="btn-small cockpit-grow" v-else @click="f_cancel_train" aria-label="cancel training" data-tooltip="Cancel the running training"><ui_icon s_name="stop" /> cancel</button>
                        </div>
                        <div class="cockpit-status" :class="s_class__job" role="status" v-if="s_status__job">{{ s_status__job }}</div>
                    </div>
                </template>
            </div>
        </section>

        <teleport to="body">
            <div class="ml-ask-backdrop" v-if="o_ml.b_ask__leave" @pointerdown.self="f_stay">
                <div class="ml-ask" role="alertdialog" aria-modal="true" aria-labelledby="ml-ask-text" @keydown.escape="f_stay">
                    <p id="ml-ask-text">Are you sure to leave the current field of view? Annotation data is going to be lost.</p>
                    <div class="ml-ask-row">
                        <button ref="el_stay" class="btn-small" data-control-skip @click="f_stay" aria-label="stay"
                            data-tooltip="Stay&#10;Keep the boxes. X and Y stay locked until capture has stored them.">stay</button>
                        <button class="btn-small danger" data-control-skip @click="f_leave" aria-label="leave"
                            data-tooltip="Leave&#10;Discard the boxes on the camera image. X and Y are free again.">leave</button>
                    </div>
                </div>
            </div>
            <div class="ml-progress-backdrop" v-if="o_progress__stage">
                <div class="ml-progress" role="status" :data-tooltip="o_progress__stage.s_tooltip">
                    <span class="ml-progress-spinner" aria-hidden="true"></span>
                    <span class="ml-progress-text" :class="{ 'ml-progress-text--capture': o_ml.o_progress__capture }">{{ o_progress__stage.s_text }}</span>
                    <button class="btn-small" v-if="o_ml.o_progress__capture" data-control-skip @click="f_cancel_capture" :disabled="o_ml.o_progress__capture.b_cancel || o_ml.o_progress__capture.b_return" aria-label="cancel"
                        data-tooltip="Cancel&#10;Stop taking images. No image of this capture is kept, the boxes stay on the image.">cancel</button>
                </div>
            </div>
        </teleport>

        <ml_stage />
        <ml_library />
    `,
    data: function() {
        return {
            o_state: o_state,
            o_ml: o_ml,
            N_CNT__FOCUS_MAX: N_CNT__FOCUS_MAX,
            A_O_ORGANISATION__PREDEFINED: A_O_ORGANISATION__PREDEFINED,
            s_name__person: '',
            s_name__organisation: '',
            b_class__creating: false,
            s_name__class__refused: '',
            s_name__class__new: '',
            a_o_field__dataset: [{ s_key: 's_name', s_label: 'name', n_len__max: 100 }],
            a_o_field__model: [{ s_key: 's_name', s_label: 'name', n_len__max: 100 }],
            // the class whose order handle is dragged, 0 for none
            n_id__class__moving: 0,
            // the focus points are experimental: folded away until they are asked for
            b_focus: false,
        };
    },
    computed: {
        o_dataset: function() {
            return f_o_dataset__current();
        },
        o_calibration: function() {
            return f_o_calibration__local();
        },
        b_px_per_step: function() {
            return this.o_calibration.n_px_per_step_x > 0 && this.o_calibration.n_px_per_step_y > 0;
        },
        s_um_per_px: function() {
            let n = this.o_calibration.n_um_per_px;
            return (n ? this.f_s_number(n) : '—') + ' µm/px';
        },
        s_px_per_step: function() {
            let o = this.o_calibration;
            return (o.n_px_per_step_x ? this.f_s_number(o.n_px_per_step_x) : '—') + ' · '
                + (o.n_px_per_step_y ? this.f_s_number(o.n_px_per_step_y) : '—') + ' px/step';
        },
        b_disk_low: function() {
            return o_ml.n_byte__free !== null && o_ml.n_byte__free < N_BYTE__FREE_WARN;
        },
        s_byte__free: function() {
            return (o_ml.n_byte__free / (1024 * 1024 * 1024)).toFixed(1) + ' GB';
        },
        a_s_name__microscope: function() {
            return o_ml.a_o_microscope.map(function(o){ return o.s_name; });
        },
        // objectives already used with the entered microscope
        a_s_name__calibration: function() {
            let s_name = o_state.o_ml_config.s_name__microscope.trim().toLowerCase();
            let o_microscope = o_ml.a_o_microscope.find(function(o){ return o.s_name.toLowerCase() === s_name; });
            return o_microscope ? [...new Set(o_microscope.a_o_calibration.map(function(o){ return o.s_name; }))] : [];
        },
        s_tooltip__dataset: function() {
            let o_dataset = this.o_dataset;
            if(!o_dataset) return 'Every image and every class belongs to a dataset.';
            return 'Created by ' + o_dataset.s_name__person + ' · ' + o_dataset.n_cnt__image__done + '/' + o_dataset.n_cnt__image + ' images done';
        },
        b_capture_blocked: function() {
            return o_ml.s_activity !== '' || f_a_s_reason__capture().length > 0;
        },
        s_tooltip__capture: function() {
            let a_s_reason = f_a_s_reason__capture();
            if(a_s_reason.length) return 'Capture\n' + a_s_reason.join('\n');
            return 'Capture\nStore the camera image with its boxes in the dataset'
                + (o_ml.n_cnt__focus > 1 ? ', one image at each of the ' + o_ml.n_cnt__focus + ' focus points.' : '.')
                + ' Without a box it is an example without objects.';
        },
        // how far a capture with several focus points is
        s_progress__capture: function() {
            let o_progress = o_ml.o_progress__capture;
            if(!o_progress) return '';
            if(o_progress.b_cancel) return 'cancelling';
            if(o_progress.b_return) return 'returning focus';
            return 'capturing focus point ' + (o_progress.n_idx + 1) + '/' + o_progress.n_cnt;
        },
        // what the middle of the image says while the application is at work on it: { s_text, s_tooltip }, null otherwise
        o_progress__stage: function() {
            if(o_ml.o_progress__capture) return {
                s_text: this.s_progress__capture,
                s_tooltip: 'Capture · draft\nOne image is taken at each focus point. Until the last one is stored no motor can be moved.',
            };
            if(o_ml.s_activity === 'detect') return {
                s_text: 'detecting objects',
                s_tooltip: 'Detect objects · draft\nThe model looks for objects on the image. On the live image nothing is shown when X or Y moves meanwhile.',
            };
            return null;
        },
        // the image captured last
        o_image__last: function() {
            let o_image__last = null;
            for(let o_image of o_ml.a_o_image){
                if(!o_image__last || o_image.n_id > o_image__last.n_id) o_image__last = o_image;
            }
            return o_image__last;
        },
        s_url__thumbnail: function() {
            return f_s_url__thumbnail(this.o_image__last);
        },
        // boxes on the camera image hold the field of view
        b_view__held: function() {
            return f_b_view__held();
        },
        // what is on the stage, and whether X and Y are locked for it
        s_status__stage: function() {
            let n_cnt = o_ml.a_o_bbox.length;
            let a_s_part = [];
            let n_cnt__prediction = o_ml.a_o_prediction.length;
            if(o_ml.o_image) a_s_part.push('image ' + o_ml.o_image.n_id);
            if(n_cnt > 0 || o_ml.o_image) a_s_part.push(n_cnt + (n_cnt === 1 ? ' box' : ' boxes'));
            if(n_cnt__prediction > 0) a_s_part.push(n_cnt__prediction + (n_cnt__prediction === 1 ? ' prediction' : ' predictions'));
            if(o_ml.s_status__save) a_s_part.push(o_ml.s_status__save);
            if(this.b_view__held) a_s_part.push('x · y locked');
            return a_s_part.join(' · ');
        },
        n_step__focus: function() {
            return f_n_step__focus();
        },
        // where X and Y stand: the focus points belong to one field of view
        s_position__view: function() {
            return ['x', 'y'].map(function(s_axis) {
                let n_motor = f_n_motor__axis(s_axis, true);
                let o_motor = n_motor === null ? null : o_state.a_o_motor[n_motor];
                return o_motor && Number.isFinite(o_motor.n_position) ? o_motor.n_position : '';
            }).join(':');
        },
        b_job_active: function() {
            return f_b_job__active();
        },
        // the base model "train" fine-tunes, null until the data server has listed them
        o_model_base: function() {
            return f_o_model_base(o_state.o_ml_config.s_name__model_base);
        },
        b_model_base__installed: function() {
            return !!this.o_model_base && !!this.o_model_base.s_version__library;
        },
        // exactly what is fine-tuned: the weights, who published them, what they were trained on,
        // how large the network is, the image it is trained with, and the library that trains it
        s_detail__model_base: function() {
            let o_model_base = this.o_model_base;
            if(!o_model_base) return '';
            return [
                o_model_base.s_name_file__weight,
                o_model_base.s_publisher,
                o_model_base.s_pretrained,
                (o_model_base.n_cnt__parameter / 1e6).toFixed(1) + ' M parameters',
                o_model_base.n_px__image + ' px',
                o_model_base.s_library + ' ' + (o_model_base.s_version__library || 'not installed'),
                o_model_base.s_license,
            ].join(' · ');
        },
        s_tooltip__model_base: function() {
            let o_model_base = this.o_model_base;
            let s_tooltip = 'Fine-tune\nThe pretrained model a training starts from. The trained model keeps its kind and is applied the same way.';
            if(o_model_base && !o_model_base.s_version__library){
                s_tooltip += '\n' + o_model_base.s_label + ' is not installed. Run in MicroMatic_Server: deno task install';
            }
            return s_tooltip;
        },
        s_tooltip__train: function() {
            let o_model_base = this.o_model_base;
            if(o_model_base && !o_model_base.s_version__library){
                return 'Train\n' + o_model_base.s_label + ' is not installed. Run in MicroMatic_Server: deno task install';
            }
            return 'Train\nFine-tune ' + (o_model_base ? o_model_base.s_label : 'the chosen model')
                + ' with the images marked as done. Needs at least 2 of them and 1 box.';
        },
        s_status__job: function() {
            let o_job = o_ml.o_job;
            if(!o_job) return '';
            // the job says itself what it fine-tunes: the choice in the window may have changed since
            let s_label = this.f_s_label__model_base(o_job.s_name__model_base);
            if(o_job.s_status === 'preparing') return 'training ' + s_label + ' · preparing';
            if(o_job.s_status === 'running') return 'training ' + s_label + ' · ' + o_job.n_epoch + '/' + o_job.n_epoch__total;
            if(o_job.s_status === 'done') return 'trained ' + s_label + ' · ' + o_job.n_epoch__total + '/' + o_job.n_epoch__total;
            if(o_job.s_status === 'cancelled') return 'training ' + s_label + ' cancelled';
            return 'training ' + s_label + ' failed';
        },
        s_class__job: function() {
            let o_job = o_ml.o_job;
            return { running: this.b_job_active, error: !!o_job && o_job.s_status === 'error' };
        },
        // below the name of the chosen model, which the element says itself
        s_tooltip__model: function() {
            let o_model = o_ml.a_o_model.find(function(o){ return o.n_id === o_state.o_ml_config.n_id__model; });
            if(!o_model) return 'Train a model or upload one.';
            let o_dataset = o_ml.a_o_dataset.find(function(o){ return o.n_id === o_model.n_o_dataset_n_id; });
            return this.f_s_detail__model(o_model)
                + '\nDataset: ' + (o_dataset ? o_dataset.s_name : (o_model.n_o_dataset_n_id ? 'another one' : 'deleted or none'));
        },
    },
    methods: {
        f_save_config,
        f_refresh_dataset_list__quiet,
        f_capture,
        f_cancel_capture,
        f_close_still,
        f_save_bbox__now,
        f_export,
        f_train,
        f_cancel_train,
        f_detect,
        // three significant digits are enough to recognise a calibration
        f_s_number: function(n) {
            return Number(n.toPrecision(3)).toString();
        },
        f_close: function() {
            o_state.o_panel_visibility.ml_training = false;
            f_save_setting__debounced('o_panel_visibility', o_state.o_panel_visibility);
        },
        f_open_panel: function(s_panel) {
            if(!o_state.o_panel_visibility[s_panel]) o_actions.f_invoke('panel.' + s_panel);
        },
        f_login: async function() {
            if(await f_login(this.s_name__person, this.s_name__organisation)) this.s_name__person = '';
        },
        // an account of the list: its two names go into the fields and are logged in.
        // "/" is in no name of an organisation or a person.
        f_login__predefined: async function(o_evt) {
            let s_value = o_evt.target.value;
            o_evt.target.value = '';
            if(s_value === '') return;
            [this.s_name__organisation, this.s_name__person] = s_value.split('/');
            await this.f_login();
        },
        f_logout: function() {
            if(confirm('Log out ' + o_ml.o_person.s_name + '?' + (f_b_view__held() ? ' The boxes on the camera image are lost.' : ''))) f_logout();
        },
        // boxes name classes of the dataset they were drawn for: they cannot follow to another one
        f_b_leave_dataset: function() {
            return !f_b_view__held() || confirm('The boxes on the camera image are not captured yet. Discard them and change the dataset?');
        },
        f_select_dataset: function(o_dataset) {
            if(o_dataset.n_id === o_state.o_ml_config.n_id__dataset || !this.f_b_leave_dataset()) return;
            f_select_dataset(o_dataset.n_id);
        },
        f_b_create_dataset: async function(o_value) {
            if(!this.f_b_leave_dataset()) return false;
            return await f_create_dataset(o_value.s_name);
        },
        f_b_update_dataset: function(o_dataset, o_value) {
            return f_rename_dataset(o_dataset, o_value.s_name);
        },
        f_s_url__thumbnail__dataset: function(o_dataset) {
            return f_s_url__thumbnail(o_dataset.o_image__last || null);
        },
        // deleting a dataset cannot be undone: the name has to be typed
        f_delete_dataset: function(o_dataset) {
            let s_name = prompt('Delete the dataset "' + o_dataset.s_name + '" with its ' + o_dataset.n_cnt__image
                + ' images? This cannot be undone. Export it first.\n\nType the name of the dataset to delete it:');
            if(s_name === null) return;
            if(s_name.trim() !== o_dataset.s_name){
                alert('The name does not match. Nothing was deleted.');
                return;
            }
            f_delete_dataset(o_dataset);
        },
        // Enter creates the class, and so does leaving the field: a typed name is not lost
        f_create_class: async function(o_evt) {
            let s_name = this.s_name__class__new.trim();
            if(!s_name || this.b_class__creating) return;
            // a name that was refused stays in the field. leaving the field does not ask for it again.
            if(o_evt && o_evt.type === 'blur' && s_name === this.s_name__class__refused) return;
            this.b_class__creating = true;
            try {
                if(await f_create_class(s_name)) this.s_name__class__new = '';
                else this.s_name__class__refused = s_name;
            } finally {
                this.b_class__creating = false;
            }
        },
        f_on_class_name: async function(o_class, o_evt) {
            let s_name = o_evt.target.value.trim();
            if(s_name === '' || s_name === o_class.s_name || !await f_update_class(o_class, { s_name })){
                // an empty or refused name falls back to the stored one
                o_evt.target.value = o_class.s_name;
            }
        },
        f_on_class_color: function(o_class, o_evt) {
            f_update_class(o_class, { s_color_hex: o_evt.target.value });
        },
        // asked every time: one click on the wrong row must not take a class away
        f_delete_class: function(o_class) {
            let f_s_question = function(n_cnt__bbox) {
                if(n_cnt__bbox === 0) return 'Delete the class "' + o_class.s_name + '"?';
                return 'The class "' + o_class.s_name + '" is used by ' + n_cnt__bbox + (n_cnt__bbox === 1 ? ' box. Delete the class and this box?' : ' boxes. Delete the class and these boxes?');
            };
            let n_cnt__bbox = f_n_cnt__bbox__of_class(o_class);
            if(!confirm(f_s_question(n_cnt__bbox))) return;
            // the data server counts the stored boxes itself: it is asked again only when it knows of more
            f_delete_class(o_class, function(n_cnt__bbox__stored) {
                return n_cnt__bbox__stored <= n_cnt__bbox || confirm(f_s_question(n_cnt__bbox__stored));
            });
        },
        // the order handle of a class is dragged: the class follows the pointer row by row
        f_on_order_down: function(o_class, o_evt) {
            if(o_evt.button !== 0 || o_ml.s_activity !== '') return;
            let o_self = this;
            let a_o_class__start = o_ml.a_o_class;
            o_self.n_id__class__moving = o_class.n_id;
            let f_on_move = function(o_evt__move) {
                let a_el = [...o_self.$refs.el_class_list.querySelectorAll('.ml-class:not(.ml-class--new)')];
                let n_idx__to = a_el.findIndex(function(el){ return o_evt__move.clientY < el.getBoundingClientRect().bottom; });
                if(n_idx__to === -1) n_idx__to = a_el.length - 1;
                let n_idx__from = o_ml.a_o_class.findIndex(function(o){ return o.n_id === o_class.n_id; });
                if(n_idx__from !== -1 && n_idx__to !== n_idx__from) o_ml.a_o_class = f_a_v__moved(o_ml.a_o_class, n_idx__from, n_idx__to);
            };
            let f_on_end = function(o_evt__end) {
                window.removeEventListener('pointermove', f_on_move);
                window.removeEventListener('pointerup', f_on_end);
                window.removeEventListener('pointercancel', f_on_end);
                o_self.n_id__class__moving = 0;
                let a_o_class = o_ml.a_o_class;
                // the data server decides: until it has answered the old order is the true one
                o_ml.a_o_class = a_o_class__start;
                let b_changed = a_o_class.some(function(o, n_idx){ return o.n_id !== a_o_class__start[n_idx].n_id; });
                if(b_changed && o_evt__end.type === 'pointerup') f_reorder_class(a_o_class);
            };
            window.addEventListener('pointermove', f_on_move);
            window.addEventListener('pointerup', f_on_end);
            window.addEventListener('pointercancel', f_on_end);
        },
        // arrow keys on the order handle: one place up or down
        f_move_class: async function(o_class, n_step) {
            let n_idx = o_ml.a_o_class.findIndex(function(o){ return o.n_id === o_class.n_id; });
            let n_idx__to = n_idx + n_step;
            if(n_idx === -1 || n_idx__to < 0 || n_idx__to >= o_ml.a_o_class.length || o_ml.s_activity !== '') return;
            await f_reorder_class(f_a_v__moved(o_ml.a_o_class, n_idx, n_idx__to));
            // the row was moved, and with it the handle lost the cursor
            let el_list = this.$refs.el_class_list;
            let el_handle = el_list && el_list.querySelector('.ml-class[data-id="' + o_class.n_id + '"] .ml-class-order');
            if(el_handle) el_handle.focus();
        },
        f_toggle_done: function() {
            f_set_done(!o_ml.o_image.b_done);
        },
        f_on_focus_count: function(o_evt) {
            f_set_cnt__focus(o_evt.target.value);
            // an entry outside 1 to 9 falls back to what is used
            o_evt.target.value = o_ml.n_cnt__focus;
        },
        f_set_focus,
        f_stay: function() {
            o_ml.b_ask__leave = false;
        },
        f_leave: function() {
            f_discard_bbox__camera();
        },
        f_on_epoch_change: function() {
            let n_epoch = Math.round(Number(o_state.o_ml_config.n_epoch));
            o_state.o_ml_config.n_epoch = Math.min(Math.max(n_epoch || 1, 1), 1000);
            f_save_config();
        },
        // how the window names a base model; a name the data server does not list stands for itself
        f_s_label__model_base: function(s_name) {
            let o_model_base = f_o_model_base(s_name);
            return o_model_base ? o_model_base.s_label : s_name;
        },
        // the second line of a model in its list: what it was fine-tuned from, when it was made,
        // and with how many images it was trained
        f_s_detail__model: function(o_model) {
            let n_cnt = o_model.n_cnt__image;
            // a model that was uploaded, or trained before the number was stored
            let b_known = Number.isInteger(n_cnt);
            return (o_model.s_name__model_base ? this.f_s_label__model_base(o_model.s_name__model_base) + ' · ' : '')
                + f_s_date_time(o_model.n_ts_ms__created) + ' · ' + (b_known ? n_cnt : '—') + (n_cnt === 1 ? ' image' : ' images');
        },
        f_select_model: function(o_model) {
            f_select_model(o_model.n_id);
        },
        f_b_update_model: function(o_model, o_value) {
            return f_rename_model(o_model, o_value.s_name);
        },
        // "+" of the model: a model is not typed in, it is a file
        f_pick_model_file: function() {
            this.$refs.el_file__model.click();
        },
        f_on_model_file: async function(o_evt) {
            let o_file = o_evt.target.files[0];
            o_evt.target.value = '';
            if(o_file) await f_upload_model(o_file);
        },
        f_delete_model: function(o_model) {
            if(confirm('Delete the model "' + o_model.s_name + '"?')) f_delete_model(o_model);
        },
        f_on_video_size: function(o_evt) {
            if(o_evt.target && o_evt.target.id === 'webcamVideo') f_camera_changed();
        },
        // the image keeps clear of the dock; everything that measures the image has to measure again
        f_apply_open: function(b_open) {
            document.body.classList.toggle('ml-docked', b_open);
            this.$nextTick(function(){ window.dispatchEvent(new Event('resize')); });
        },
    },
    watch: {
        'o_state.o_panel_visibility.ml_training': function(b_open) {
            this.f_apply_open(!!b_open);
        },
        s_position__view: function() {
            f_reset_focus();
        },
        // the question opens under the hands of whoever moved X or Y: the safe answer gets the cursor
        'o_ml.b_ask__leave': function(b_ask) {
            let o_self = this;
            if(b_ask) o_self.$nextTick(function(){ if(o_self.$refs.el_stay) o_self.$refs.el_stay.focus(); });
        },
        // the session of the data server needs the stored settings: the dataset chosen last time
        'o_state.b_applied__setting': {
            handler: function(b_applied) {
                if(b_applied) f_watch_session(true);
            },
            immediate: true,
        },
    },
    mounted: function() {
        this.f_apply_open(!!o_state.o_panel_visibility.ml_training);
        // the video element says when the camera image gets its size and when
        // the size changes. these events do not bubble, so they are caught on the way down.
        document.addEventListener('loadedmetadata', this.f_on_video_size, true);
        document.addEventListener('resize', this.f_on_video_size, true);
    },
    beforeUnmount: function() {
        document.body.classList.remove('ml-docked');
        document.removeEventListener('loadedmetadata', this.f_on_video_size, true);
        document.removeEventListener('resize', this.f_on_video_size, true);
        f_watch_session(false);
    },
};

export { o_component__ml_training };
