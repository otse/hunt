import audio from "./audio.js";
import hooks from "./lib/hooks.js";
import hunt from "./hunt.js";
import physics from "./physics.js";
import renderer from "./renderer.js";
var props;
(function (props) {
    function factory(object) {
        let prop;
        if (!object.name)
            return;
        const [kind, preset] = object.name.split('_');
        switch (kind) {
            case 'prop':
            case 'box':
                console.log(' new pbox ', kind, preset);
                prop = new pbox(object, {});
                break;
            case 'env':
            case 'sound':
                prop = new psound(object, {});
                break;
            case 'light':
                prop = new plight(object, {});
                break;
            case 'spotlight':
                prop = new pspotlight(object, {});
                break;
            case 'wall':
            case 'solid':
                prop = new pwallorsolid(object, {});
                break;
            case 'door':
                prop = new pdoor(object, {});
                break;
            case 'fan':
                prop = new pfan(object, {});
                break;
            default:
        }
        if (prop) {
            prop.kind = kind;
            prop.preset = preset;
        }
        return prop;
    }
    props.factory = factory;
    function boot() {
    }
    props.boot = boot;
    function loop() {
        for (let prop of props.collection)
            prop.loop();
    }
    props.loop = loop;
    function clear() {
        const array = props.collection.slice(0);
        for (let prop of array)
            prop.lod();
        props.collection = [];
    }
    props.clear = clear;
    function take_collada_prop(prop) {
        // the prop is sitting in a rotated, scaled scene graph
        // set it apart
        const group = new THREE.Group();
        const object = prop.object;
        object.matrixWorld.decompose(group.position, group.quaternion, group.scale);
        object.position.set(0, 0, 0);
        object.rotation.set(0, 0, 0);
        object.quaternion.identity();
        object.updateMatrix();
        object.updateMatrixWorld();
        group.add(object);
        group.updateMatrix();
        group.updateMatrixWorld(true);
        renderer.propsGroup.add(group);
        function traversal(object) {
            object.geometry?.computeBoundingBox();
        }
        group.traverse(traversal);
        prop.group = group;
    }
    props.take_collada_prop = take_collada_prop;
    props.collection = [];
    props.walls = [];
    props.sounds = [];
    props.boxes = [];
    props.lights = [];
    class prop {
        object;
        parameters;
        array = [];
        type;
        kind;
        preset;
        group;
        oldRotation;
        fbody;
        aabb;
        constructor(object, parameters) {
            this.object = object;
            this.parameters = parameters;
            this.type = 'ordinary prop';
            props.collection.push(this);
        }
        complete() {
            this.array.push(this);
            take_collada_prop(this);
            this.measure();
            this._finish();
        }
        _finish() {
        }
        _lod() {
        }
        _loop() {
        }
        loop() {
            this._loop();
        }
        lod() {
            // messy splices
            props.collection.splice(props.collection.indexOf(this), 1);
            this.array.splice(this.array.indexOf(this), 1);
            //this.group.remove();
            renderer.propsGroup.remove(this.group);
            this._lod();
            if (this.fbody)
                this.fbody.lod();
        }
        measure() {
            this.aabb = new THREE.Box3();
            this.aabb.setFromObject(this.object);
        }
        correction_for_physics() {
            // strange but very clear code
            const size = new THREE.Vector3();
            this.aabb.getSize(size);
            size.multiplyScalar(hunt.inchMeter);
            this.object.rotation.set(-Math.PI / 2, 0, 0);
            this.object.position.set(-size.x / 2, -size.y / 2, size.z / 2);
        }
    }
    props.prop = prop;
    class pwallorsolid extends prop {
        constructor(object, parameters) {
            super(object, parameters);
            this.type = 'pwallorsolid';
            this.array = props.walls;
        }
        _finish() {
            new physics.fbox(this);
            if (this.object.name == 'wall')
                this.object.visible = false;
        }
        _loop() {
        }
    }
    props.pwallorsolid = pwallorsolid;
    class pbox extends prop {
        constructor(object, parameters) {
            super(object, parameters);
            this.type = 'pbox';
            this.array = props.boxes;
        }
        _finish() {
            new physics.fbox(this);
        }
        _loop() {
            this.group.position.copy(this.fbody.body.position);
            this.group.quaternion.copy(this.fbody.body.quaternion);
            this.fbody.loop();
        }
        _lod() {
        }
    }
    props.pbox = pbox;
    const presets_sounds = {
        skylight: { name: 'alien_powernode', volume: .3, loop: true, distance: 4 },
        fan: { name: 'tram_move', volume: .05, loop: true, distance: 3.0, delay: [0, 3] },
        radio: { name: 'alien_cycletone', volume: .4, loop: true, distance: 3, delay: [0, 1] },
        swedge: { name: 'ambience6', volume: .4, loop: true, distance: 4, delay: [0, 1] },
    };
    class psound extends prop {
        sound;
        constructor(object, parameters) {
            super(object, parameters);
            this.type = 'psound';
            this.array = props.sounds;
            const paly = () => {
                if (this.kind == 'env')
                    this._play();
            };
            hooks.register('audioGestured', (x) => {
                console.warn('late playing', this.preset);
                const preset = presets_sounds[this.preset];
                if (!preset)
                    return;
                if (preset.delay)
                    setTimeout(paly, preset.delay[0] + preset.delay[1] * Math.random() * 1000);
                else
                    paly();
                return false;
            });
        }
        _finish() {
            this.object.visible = false;
            this._play();
        }
        _loop() {
        }
        _play() {
            if (!audio.allDone)
                return;
            const preset = presets_sounds[this.preset];
            if (!preset)
                return;
            this.sound = audio.playOnce(preset.name, preset.volume, preset.loop);
            if (this.sound) {
                this.group.add(this.sound);
                const panner = this.sound.getOutput();
                panner.distanceModel = 'exponential';
                panner.rolloffFactor = 4;
                panner.panningModel = 'HRTF';
                this.sound?.setRefDistance(preset.distance);
                const helper = new PositionalAudioHelper(this.sound);
                this.group.add(helper);
                helper.update();
            }
        }
    }
    props.psound = psound;
    class pfan extends prop {
        constructor(object, parameters) {
            super(object, parameters);
            this.type = 'pfan';
        }
        _finish() {
            //this.group.add(new THREE.AxesHelper(1 * hunt.inchMeter));
            const size = new THREE.Vector3();
            const center = new THREE.Vector3();
            this.aabb.getSize(size);
            this.aabb.getCenter(center);
            const temp = new THREE.Vector3(size.x, size.z, size.y);
            temp.multiplyScalar(hunt.inchMeter);
            size.divideScalar(2);
            size.z = -size.z;
            if (this.preset == 'y') {
            }
            if (this.preset == 'z') {
            }
            this.object.position.sub(temp.divideScalar(2));
            this.group.position.add(size);
            //size.divideScalar(2);
            //this.object.position.sub(size);
            //this.object.position.add(size);
        }
        _loop() {
            if (this.preset == 'y')
                this.group.rotation.z += 0.005;
            if (this.preset == 'z')
                this.group.rotation.y += 0.005;
            this.group.updateMatrix();
        }
    }
    props.pfan = pfan;
    class pdoor extends prop {
        constructor(object, parameters) {
            super(object, parameters);
            this.type = 'pdoor';
        }
        _finish() {
            new physics.fdoor(this);
            //this.object.add(new THREE.AxesHelper(20));
            //this.group.add(new THREE.AxesHelper(20));
        }
        _loop() {
            this.group.position.copy(this.fbody.body.position);
            this.group.quaternion.copy(this.fbody.body.quaternion);
            this.fbody.loop();
        }
    }
    props.pdoor = pdoor;
    const presets_lights = {
        sconce: { hide: false, color: 'white', intensity: 0.1, distance: 1, offset: [0, 0, -5] },
        sconce1: { hide: true, color: 'white', intensity: 0.1, distance: 2.0, decay: 0.1 },
        openwindow: { hide: true, color: 'white', intensity: 0.5, distance: 3, decay: 0.3 },
        skylightstart: { hide: true, color: 'white', intensity: 0.3, distance: 3.5, decay: 0.5 },
        mtfanambient: { hide: true, color: 'white', intensity: 0.15, distance: 5.0, decay: 0.1 },
        skirt: { hide: true, color: 'green', intensity: 0.1, distance: 3.0, decay: 1.5, shadow: true },
        alert: { hide: true, color: 'red', intensity: 0.05, distance: 1.0, decay: 0.6 },
        sewerworld: { hide: true, color: 'red', intensity: 0.1, distance: 2.0, decay: 0.1 },
        lwedge: { hide: true, color: 'cyan', intensity: 0.2, distance: 6.5, decay: 0.2, shadow: true },
        lconnector: { hide: true, color: 'white', intensity: 0.2, distance: 5.0, decay: 0.2 },
        none: { hide: true, color: 'white', intensity: 0.1, distance: 10 }
    };
    class plight extends prop {
        constructor(object, parameters) {
            super(object, parameters);
            this.type = 'plight';
            this.array = props.lights;
        }
        _finish() {
            //this.object.visible = false;
            const preset = presets_lights[this.preset || 'none'];
            if (!preset) {
                console.log(' critical preset doesnt exist ', this.preset);
                return;
            }
            this.object.visible = !preset.hide;
            let center = new THREE.Vector3();
            this.aabb.getSize(center);
            center.divideScalar(2.0);
            center.multiplyScalar(hunt.inchMeter);
            let light = new THREE.PointLight(preset.color, preset.intensity, preset.distance, preset.decay);
            light.castShadow = preset.shadow;
            //light.position.fromArray(preset.offset || [0, 0, 0]);
            light.position.add(center);
            // light.add(new THREE.AxesHelper(10));
            this.group.add(light);
        }
        _loop() {
        }
        _lod() {
        }
    }
    props.plight = plight;
    const presets_spotlight = {
        sewerworld: { hide: true, color: 'red', intensity: 1.0, distance: 10.0, decay: 1.0, shadow: true, target: [0, 1, 0] },
        slskirt: { hide: true, color: '#d0d69b', intensity: 3.0, distance: 8.0, decay: 1.0, shadow: true, target: [0, 0, -1] },
    };
    class pspotlight extends prop {
        constructor(object, parameters) {
            super(object, parameters);
            this.type = 'pspotlight';
            this.array = props.lights;
        }
        _finish() {
            const preset = presets_spotlight[this.preset || 'none'];
            this.object.visible = !preset.hide;
            const size = new THREE.Vector3();
            const center = new THREE.Vector3();
            this.aabb.getSize(size);
            this.aabb.getCenter(center);
            size.multiplyScalar(hunt.inchMeter);
            //console.log('light size, center', size, center);
            let light = new THREE.SpotLight(preset.color, preset.intensity, preset.distance, preset.decay);
            light.castShadow = preset.shadow;
            light.shadow.camera.far = 1000;
            //light.angle = Math.PI / 2;
            light.penumbra = 0.5;
            //light.decay = 0.1;
            //light.shadow.camera.near = 0.5;
            //light.position.add(size.divideScalar(2.0));
            //light.target.position.add(size.divideScalar(2.0));
            light.target.position.add(new THREE.Vector3().fromArray(preset.target).multiplyScalar(10));
            //this.group.add(new THREE.AxesHelper(10));
            this.group.add(light);
            this.group.add(light.target);
            //this.group.add(new THREE.AxesHelper(1 * hunt.inchMeter));
        }
        _loop() {
        }
    }
    props.pspotlight = pspotlight;
    props.impact_sounds = {
        'cardboard': {
            soft: [
                'cardboard_box_impact_soft1',
                'cardboard_box_impact_soft2',
                'cardboard_box_impact_soft3',
                'cardboard_box_impact_soft4',
                'cardboard_box_impact_soft5',
                'cardboard_box_impact_soft6',
                'cardboard_box_impact_soft7',
            ],
            hard: [
                'cardboard_box_impact_hard1',
                'cardboard_box_impact_hard2',
                'cardboard_box_impact_hard3',
                'cardboard_box_impact_hard4',
                'cardboard_box_impact_hard5',
                'cardboard_box_impact_hard6',
                'cardboard_box_impact_hard7',
            ]
        },
        'plastic': {
            soft: [
                'plastic_box_impact_soft1',
                'plastic_box_impact_soft2',
                'plastic_box_impact_soft3',
                'plastic_box_impact_soft4',
            ],
            hard: [
                'plastic_box_impact_hard1',
                'plastic_box_impact_hard2',
                'plastic_box_impact_hard3',
                'plastic_box_impact_hard4',
            ]
        },
        'metal': {
            soft: [
                'metal_solid_impact_soft1',
                'metal_solid_impact_soft2',
                'metal_solid_impact_soft3',
            ],
            hard: [
                'metal_solid_impact_hard1',
                'metal_solid_impact_hard4',
                'metal_solid_impact_hard5',
            ],
        }
    };
})(props || (props = {}));
export default props;
