import Expo from 'expo';
import React from 'react';
import { PanResponder } from 'react-native';

const THREE = require('three');
global.THREE = THREE;
require('three/examples/js/loaders/OBJLoader');
import ExpoTHREE from 'expo-three';
import * as CANNON from 'cannon';

console.disableYellowBox = true;

if (!console.time) {
  console.time = () => {};
}
if (!console.timeEnd) {
  console.timeEnd = () => {};
}

const scaleLongestSideToSize = (mesh, size) => {
  const { x: width, y: height, z: depth } =
    new THREE.Box3().setFromObject(mesh).size();
  const longest = Math.max(width, Math.max(height, depth));
  const scale = size / longest;
  mesh.scale.set(scale, scale, scale);
}

export default class App extends React.Component {
  componentWillMount() {
    this.panResponder = PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        this.touching = true;
      },
      onPanResponderRelease: () => {
        this.touching = false;
      },
      onPanResponderTerminate: () => {
        this.touching = false;
      },
      onShouldBlockNativeResponder: () => false,
    });
  }

  render() {
    return (
      <Expo.GLView
        {...this.panResponder.panHandlers}
        ref={(ref) => this._glView = ref}
        style={{ flex: 1 }}
        onContextCreate={this._onGLContextCreate}
      />
    );
  }

  _onGLContextCreate = async (gl) => {
    const width = gl.drawingBufferWidth;
    const height = gl.drawingBufferHeight;

    // ar init
    const arSession = await this._glView.startARSessionAsync();

    // three.js init
    const renderer = ExpoTHREE.createRenderer({ gl });
    renderer.setSize(width, height);
    const scene = new THREE.Scene();
    scene.background = ExpoTHREE.createARBackgroundTexture(arSession, renderer);
    const camera = ExpoTHREE.createARCamera(arSession, width, height, 0.01, 1000);
    // const camera = new THREE.PerspectiveCamera(75, width / height, 0.01, 1000);

    // cannon.js init
    const world = new CANNON.World();
    world.gravity.set(0, -9.82, 0);
    world.broadphase = new CANNON.NaiveBroadphase();

    // lights
    const dirLight = new THREE.DirectionalLight(0xdddddd);
    dirLight.position.set(1, 1, 1);
    scene.add(dirLight);
    const ambLight = new THREE.AmbientLight(0x505050);
    scene.add(ambLight);

    // ground
    const groundMaterial = new CANNON.Material();
    const groundBody = new CANNON.Body({
      mass: 0,
      shape: new CANNON.Plane(),
      material: groundMaterial,
      position: new CANNON.Vec3(0, -0.22, 0),
    });
    groundBody.quaternion.setFromAxisAngle(new CANNON.Vec3(1,0,0), -Math.PI/2);
    world.add(groundBody);

    // objects (three.js mesh <-> cannon.js body pairs)
    const objects = [];

    // model
    const loader = new THREE.OBJLoader();
    const model = await new Promise((resolve, reject) =>
      loader.load(
        'https://raw.githubusercontent.com/arynchoong/ARVR-flood-orchard/master/images/rubber-duck.obj',
        resolve,
        () => {},
        reject
      )
    );
    scaleLongestSideToSize(model, 0.18);

    // ball
    const ballMaterial = new THREE.MeshPhongMaterial({
      color: new THREE.Color(0.95, 0.95, 0),
      specular: new THREE.Color(0.3, 0.3, 0.3),
    })
    const ballPhysicsMaterial = new CANNON.Material();
    for (let i = 0; i < 20; ++i) {
      const ball = {}
      ball.mesh = model.clone();
      ball.mesh.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.material = ballMaterial;
        }
      });
      scene.add(ball.mesh);
      ball.body = new CANNON.Body({
        mass: 1,
        shape: new CANNON.Sphere(0.07),
        material: ballPhysicsMaterial,
        position: new CANNON.Vec3(Math.random() - 0.5, 0.5 + 3 * Math.random(), -2 + Math.random() - 0.5),
      });
      world.add(ball.body);
      objects.push(ball);
    }
    world.addContactMaterial(new CANNON.ContactMaterial(
      groundMaterial, ballPhysicsMaterial, {
        restitution: 0.7,
        friction: 0.6,
      }));

    // main loop
    const animate = () => {
      // calculate camera position
      const cameraPos = new THREE.Vector3(0, 0, 0);
      cameraPos.applyMatrix4(camera.matrixWorld);

      // update world
      world.step(1 / 60);

      // update objects
      objects.forEach(({ mesh, body }) => {
        mesh.position.copy(body.position);
        mesh.quaternion.copy(body.quaternion);
      });

      // apply force toward camera if touching
      objects.forEach(({ body }) => {
        if (this.touching) {
          const d = body.position.vsub(cameraPos).unit().scale(-1.2);
          body.applyForce(d, body.position);
        }
      });

      // end frame and schedule new one!
      renderer.render(scene, camera);
      gl.endFrameEXP();
      requestAnimationFrame(animate);
    }
    animate();
  }
}
