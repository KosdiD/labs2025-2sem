import * as THREE from 'three';
import { ARButton } from 'three/addons/webxr/ARButton.js';

document.addEventListener('DOMContentLoaded', () => {
    // --- НАЛАШТУВАННЯ THREE.JS ---
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 20);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.xr.enabled = true; // Вмикаємо підтримку WebXR
    document.querySelector("#container").appendChild(renderer.domElement);

    // Додаємо світло для кращої візуалізації
    const light = new THREE.HemisphereLight(0xffffff, 0xbbbbff, 3);
    light.position.set(0.5, 1, 0.25);
    scene.add(light);

    // --- НАЛАШТУВАННЯ ФІЗИЧНОГО СВІТУ (CANNON-ES) ---
    const world = new CANNON.World({
        gravity: new CANNON.Vec3(0, -9.82, 0),
    });
    const objectsToUpdate = [];

    // --- ГРУПА ДЛЯ ВСЬОГО НАШОГО КОНТЕНТУ ---
    // Ми будемо розміщувати цю групу в AR
    const contentGroup = new THREE.Group();
    contentGroup.visible = false; // Робимо її невидимою до розміщення

    // 1. Підлога
    const floorGeometry = new THREE.PlaneGeometry(20, 20);
    const floorMaterial = new THREE.MeshStandardMaterial({ color: "#7BC8A4", transparent: true, opacity: 0.5 });
    const floorMesh = new THREE.Mesh(floorGeometry, floorMaterial);
    floorMesh.rotation.x = -Math.PI / 2;
    contentGroup.add(floorMesh);

    const floorShape = new CANNON.Plane();
    const floorBody = new CANNON.Body({ mass: 0, material: new CANNON.Material() });
    floorBody.addShape(floorShape);
    floorBody.quaternion.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), -Math.PI / 2);
    world.addBody(floorBody);

    // 2. Похила площина
    const inclinedPlaneGeometry = new THREE.PlaneGeometry(5, 7);
    const inclinedPlaneMaterial = new THREE.MeshStandardMaterial({ color: "#7BC224", transparent: true, opacity: 0.5 });
    const inclinedPlaneMesh = new THREE.Mesh(inclinedPlaneGeometry, inclinedPlaneMaterial);
    inclinedPlaneMesh.position.set(0, 1.5, -2);
    inclinedPlaneMesh.rotation.x = -Math.PI / 3;
    contentGroup.add(inclinedPlaneMesh);

    const inclinedPlaneShape = new CANNON.Plane();
    const inclinedPlaneBody = new CANNON.Body({ mass: 0, material: new CANNON.Material() });
    inclinedPlaneBody.addShape(inclinedPlaneShape);
    inclinedPlaneBody.position.copy(inclinedPlaneMesh.position);
    inclinedPlaneBody.quaternion.copy(inclinedPlaneMesh.quaternion);
    world.addBody(inclinedPlaneBody);

    // 3. Динамічний циліндр
    const cylinderGeometry = new THREE.CylinderGeometry(0.25, 0.25, 1, 32);
    const cylinderMaterial = new THREE.MeshStandardMaterial({ color: "red" });
    const cylinderMesh = new THREE.Mesh(cylinderGeometry, cylinderMaterial);
    const cylinderInitialPosition = new THREE.Vector3(0, 3.5, -3.5);
    cylinderMesh.position.copy(cylinderInitialPosition);
    cylinderMesh.rotation.z = Math.PI / 2;
    contentGroup.add(cylinderMesh);

    const cylinderShape = new CANNON.Cylinder(0.25, 0.25, 1, 32);
    const cylinderBody = new CANNON.Body({
        mass: 10,
        shape: cylinderShape,
        position: new CANNON.Vec3().copy(cylinderInitialPosition),
        material: new CANNON.Material(),
    });
    cylinderBody.quaternion.copy(cylinderMesh.quaternion);
    world.addBody(cylinderBody);
    objectsToUpdate.push({ mesh: cylinderMesh, body: cylinderBody });
    
    scene.add(contentGroup);

    // --- НАЛАШТУВАННЯ WEBXR ---
    let hitTestSource = null;
    let hitTestSourceRequested = false;
    let isScenePlaced = false;

    const button = ARButton.createButton(renderer, {
        requiredFeatures: ['hit-test'],
        optionalFeatures: ['dom-overlay'],
        domOverlay: { root: document.body }
    });
    button.id = 'ar-button';
    document.body.appendChild(button);

    // Контролер (тап по екрану)
    const controller = renderer.xr.getController(0);
    controller.addEventListener('select', onSelect);
    scene.add(controller);

    function onSelect() {
        if (contentGroup.visible) return; // Якщо сцена вже розміщена, нічого не робимо

        if (reticle.visible) {
            // Розміщуємо нашу групу контенту в позиції ретикули
            contentGroup.position.setFromMatrixPosition(reticle.matrix);
            contentGroup.visible = true;
            isScenePlaced = true;
        }
    }

    // Створюємо "ретикулу" - індикатор, що показує, де буде розміщена сцена
    const reticle = new THREE.Mesh(
        new THREE.RingGeometry(0.05, 0.07, 32).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial()
    );
    reticle.matrixAutoUpdate = false;
    reticle.visible = false;
    scene.add(reticle);

    // --- ГОЛОВНИЙ ЦИКЛ ОНОВЛЕННЯ ---
    const clock = new THREE.Clock();

    renderer.setAnimationLoop((timestamp, frame) => {
        const deltaTime = clock.getDelta();
        
        if (frame) {
            // Якщо ми в AR сесії
            if (!hitTestSourceRequested) {
                const session = renderer.xr.getSession();
                session.requestReferenceSpace('viewer').then((referenceSpace) => {
                    session.requestHitTestSource({ space: referenceSpace }).then((source) => {
                        hitTestSource = source;
                    });
                });
                hitTestSourceRequested = true;
                session.addEventListener('end', () => {
                    hitTestSourceRequested = false;
                    hitTestSource = null;
                });
            }

            if (hitTestSource) {
                const hitTestResults = frame.getHitTestResults(hitTestSource);
                if (hitTestResults.length > 0) {
                    const hit = hitTestResults[0];
                    reticle.visible = true;
                    const pose = hit.getPose(renderer.xr.getReferenceSpace());
                    reticle.matrix.fromArray(pose.transform.matrix);
                } else {
                    reticle.visible = false;
                }
            }
        }

        // Оновлюємо фізику, тільки якщо сцена розміщена
        if (isScenePlaced) {
            world.step(1 / 60, deltaTime, 3);
            for (const object of objectsToUpdate) {
                // Важливо: синхронізуємо позиції відносно світу, а не локальні
                object.body.position.add(contentGroup.position, object.mesh.position);
                object.mesh.quaternion.copy(object.body.quaternion);
            }
        }
        
        renderer.render(scene, camera);
    });

    window.addEventListener('resize', () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    });
});
