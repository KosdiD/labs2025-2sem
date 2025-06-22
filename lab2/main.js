// Очікуємо, поки весь HTML-документ завантажиться
document.addEventListener('DOMContentLoaded', () => {
    
    // Ініціалізація сцени за допомогою MindAR
    const mindarThree = new MindARThree.MindARThree({
        container: document.querySelector("#container"),
        imageTargetSrc: "./targets.mind", // Шлях до вашого маркера
    });

    // Отримуємо рендерер, сцену і камеру від MindAR
    const { renderer, scene, camera } = mindarThree;

    // Створюємо "якір", до якого будуть прив'язані наші 3D-об'єкти
    const anchor = mindarThree.addAnchor(0);

    // --- НАЛАШТУВАННЯ ФІЗИЧНОГО СВІТУ (CANNON-ES) ---
    const world = new CANNON.World({
        gravity: new CANNON.Vec3(0, -9.82, 0), // Стандартна гравітація
    });

    // Масив для зберігання об'єктів, які потрібно оновлювати
    const objectsToUpdate = [];

    // --- СТВОРЕННЯ ОБ'ЄКТІВ СЦЕНИ ---

    // 1. Підлога
    const floorGeometry = new THREE.PlaneGeometry(20, 20);
    const floorMaterial = new THREE.MeshBasicMaterial({ color: "#7BC8A4", transparent: true, opacity: 0.8 });
    const floorMesh = new THREE.Mesh(floorGeometry, floorMaterial);
    floorMesh.rotation.x = -Math.PI / 2; // Повертаємо, щоб лежала горизонтально
    anchor.group.add(floorMesh); // Додаємо видиму частину до якоря

    const floorShape = new CANNON.Plane();
    const floorBody = new CANNON.Body({ mass: 0 }); // Статичне тіло, mass = 0
    floorBody.addShape(floorShape);
    floorBody.quaternion.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), -Math.PI / 2); // Синхронізуємо поворот
    world.addBody(floorBody);

    // 2. Похила площина
    const inclinedPlaneGeometry = new THREE.PlaneGeometry(10, 15);
    const inclinedPlaneMaterial = new THREE.MeshBasicMaterial({ color: "#7BC224", transparent: true, opacity: 0.8 });
    const inclinedPlaneMesh = new THREE.Mesh(inclinedPlaneGeometry, inclinedPlaneMaterial);
    inclinedPlaneMesh.position.set(0, 3, -4);
    inclinedPlaneMesh.rotation.x = -Math.PI / 3; // Нахил 60 градусів
    anchor.group.add(inclinedPlaneMesh);

    const inclinedPlaneShape = new CANNON.Plane();
    const inclinedPlaneBody = new CANNON.Body({ mass: 0 });
    inclinedPlaneBody.addShape(inclinedPlaneShape);
    inclinedPlaneBody.position.copy(inclinedPlaneMesh.position);
    inclinedPlaneBody.quaternion.copy(inclinedPlaneMesh.quaternion);
    world.addBody(inclinedPlaneBody);

    // 3. Динамічний циліндр
    const cylinderGeometry = new THREE.CylinderGeometry(0.5, 0.5, 2, 32);
    const cylinderMaterial = new THREE.MeshBasicMaterial({ color: "red" });
    const cylinderMesh = new THREE.Mesh(cylinderGeometry, cylinderMaterial);
    cylinderMesh.position.set(0, 8, -8); // Початкова позиція
    cylinderMesh.rotation.z = Math.PI / 2; // Кладемо на бік
    anchor.group.add(cylinderMesh);

    const cylinderShape = new CANNON.Cylinder(0.5, 0.5, 2, 32);
    const cylinderBody = new CANNON.Body({
        mass: 10,
        shape: cylinderShape,
        linearDamping: 0.1,
        angularDamping: 0.1,
    });
    cylinderBody.position.copy(cylinderMesh.position);
    cylinderBody.quaternion.copy(cylinderMesh.quaternion);
    world.addBody(cylinderBody);

    // Додаємо циліндр до списку об'єктів для оновлення
    objectsToUpdate.push({ mesh: cylinderMesh, body: cylinderBody });

    // --- ВІЗУАЛІЗАЦІЯ СИЛ ---
    // Функція для створення стрілки (лінія + конус)
    function createArrow() {
        const arrow = new THREE.Object3D();
        const lineGeom = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 1, 0)]);
        const line = new THREE.Line(lineGeom, new THREE.LineBasicMaterial({ color: 0xffffff }));
        line.name = 'line';
        
        const coneGeom = new THREE.ConeGeometry(0.1, 0.3, 16);
        const cone = new THREE.Mesh(coneGeom, new THREE.MeshBasicMaterial({ color: 0xffffff }));
        cone.name = 'cone';
        cone.position.set(0, 1, 0); // Позиція на кінці лінії
        cone.rotation.x = Math.PI; // Вістрям вниз
        
        arrow.add(line);
        arrow.add(cone);
        arrow.visible = false; // Ховаємо спочатку
        anchor.group.add(arrow);
        return arrow;
    }
    
    const gravityArrow = createArrow();
    gravityArrow.children.forEach(c => c.material.color.set('blue'));

    // Поки що не будемо додавати всі вектори, щоб не ускладнювати. 
    // Ви можете додати їх за аналогією з гравітацією.

    // --- ГОЛОВНИЙ ЦИКЛ ОНОВЛЕННЯ ---
    const clock = new THREE.Clock();

    // Запускаємо MindAR
    const start = async() => {
        await mindarThree.start();
        renderer.setAnimationLoop(() => {
            const deltaTime = clock.getDelta();
            
            // Оновлюємо фізичний світ
            world.step(1 / 60, deltaTime, 3);

            // Синхронізуємо видимі об'єкти з фізичними тілами
            for (const object of objectsToUpdate) {
                object.mesh.position.copy(object.body.position);
                object.mesh.quaternion.copy(object.body.quaternion);
            }

            // Оновлюємо вектор гравітації
            const cylPos = cylinderBody.position;
            const gravityForce = 9.82 * cylinderBody.mass * 0.1; // Масштабуємо для видимості
            
            if (!gravityArrow.visible && cylPos.y < 9) gravityArrow.visible = true;

            if (gravityArrow.visible) {
                gravityArrow.position.copy(cylPos);
                gravityArrow.children.find(c => c.name === 'line').geometry.setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, -gravityForce, 0)]);
                gravityArrow.children.find(c => c.name === 'cone').position.y = -gravityForce;
            }

            // Рендеримо сцену
            renderer.render(scene, camera);
        });
    }

    start();
});
