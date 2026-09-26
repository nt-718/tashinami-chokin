import * as CANNON from 'cannon-es';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { CAN_SIZE, COIN_SIZE, MAX_ITEMS, PACK_SIZE, TONES, type ItemShape } from './jar-config';

export type JarItem = { shape: ItemShape; tone: number };

export type JarSceneHandle = {
  // items[i] は i 個目に瓶へ入れた物。scale は物の大きさの倍率
  setItems: (items: JarItem[], scale: number, animate: boolean) => void;
  dispose: () => void;
};

const INK = 0x3a4048;
const PAPER = '#ffffff';

// 物理演算の瓶の内側（見た目のガラスより少し内側）
const JAR_INNER_RADIUS = 1.0;
const GRAVITY = -30;
const SPAWN_HEIGHT = 3.5;
const POSE_STORAGE_KEY = 'gaman-bank-jar-poses';

const canvasTexture = (width: number, height: number, draw: (ctx: CanvasRenderingContext2D) => void) => {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  draw(canvas.getContext('2d')!);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
};

const coinFaceTexture = () => canvasTexture(256, 256, (ctx) => {
  // 灰色で描いておき、品目の色を掛け合わせて着色する
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, 256, 256);
  ctx.strokeStyle = '#c4c4c4';
  ctx.lineWidth = 14;
  ctx.beginPath();
  ctx.arc(128, 128, 104, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = '#5c5c5c';
  ctx.font = 'bold 140px Georgia, serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('¥', 128, 136);
});

// 缶の胴。実在の銘柄に似せず、品目の色の地に白い波帯を入れる
const canLabelTexture = (tone: string) => canvasTexture(512, 256, (ctx) => {
  ctx.fillStyle = tone;
  ctx.fillRect(0, 0, 512, 256);
  ctx.fillStyle = 'rgba(255,255,255,.9)';
  ctx.beginPath();
  ctx.moveTo(0, 150);
  for (let x = 0; x <= 512; x += 16) ctx.lineTo(x, 132 + Math.sin(x / 40) * 14);
  for (let x = 512; x >= 0; x -= 16) ctx.lineTo(x, 170 + Math.sin(x / 40) * 14);
  ctx.fill();
  ctx.fillStyle = 'rgba(31,35,40,.85)';
  ctx.font = '900 30px Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('GAMAN', 128, 163);
  ctx.fillText('GAMAN', 384, 163);
  ctx.fillStyle = 'rgba(255,255,255,.55)';
  ctx.fillRect(0, 14, 512, 6);
  ctx.fillRect(0, 236, 512, 6);
});

// タバコの箱の正面。上 3 割が白いフタ、下が品目の色
const packFaceTexture = (tone: string) => canvasTexture(256, 400, (ctx) => {
  ctx.fillStyle = tone;
  ctx.fillRect(0, 0, 256, 400);
  ctx.fillStyle = '#f7f5ef';
  ctx.fillRect(0, 0, 256, 112);
  ctx.fillStyle = '#c9a74a';
  ctx.fillRect(0, 108, 256, 6);
  ctx.fillStyle = '#f7f5ef';
  ctx.beginPath();
  ctx.arc(128, 250, 62, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = tone;
  ctx.font = 'bold 76px Georgia, serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('G', 128, 256);
  ctx.fillStyle = '#f7f5ef';
  ctx.font = '900 22px Arial, sans-serif';
  ctx.fillText('GAMAN', 128, 360);
  // 明るい色でも缶の山の中で見分けられるよう、下に影と縁取りを入れる
  const shade = ctx.createLinearGradient(0, 114, 0, 400);
  shade.addColorStop(0, 'rgba(0,0,0,0)');
  shade.addColorStop(1, 'rgba(31,35,40,.35)');
  ctx.fillStyle = shade;
  ctx.fillRect(0, 114, 256, 286);
  ctx.strokeStyle = 'rgba(31,35,40,.7)';
  ctx.lineWidth = 8;
  ctx.strokeRect(4, 4, 248, 392);
});

// 横倒しで積もると側面ばかり見えるので、側面と天地は品目の色で塗って見分けやすくする
const packSideTexture = (tone: string) => canvasTexture(64, 400, (ctx) => {
  ctx.fillStyle = tone;
  ctx.fillRect(0, 0, 64, 400);
  ctx.fillStyle = '#c9a74a';
  ctx.fillRect(0, 108, 64, 6);
  ctx.strokeStyle = 'rgba(31,35,40,.7)';
  ctx.lineWidth = 6;
  ctx.strokeRect(3, 3, 58, 394);
});

const labelTexture = () => canvasTexture(1024, 440, (ctx) => {
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, 1024, 440);
  ctx.strokeStyle = '#e7e9ec';
  ctx.lineWidth = 6;
  ctx.strokeRect(24, 24, 976, 392);
  ctx.fillStyle = '#1f2328';
  ctx.textAlign = 'center';
  ctx.font = '700 120px "Hiragino Sans", "Hiragino Kaku Gothic ProN", "Noto Sans JP", sans-serif';
  ctx.fillText('たしなみ貯金', 512, 250);
  ctx.fillStyle = '#8a9099';
  ctx.font = '600 34px -apple-system, "Helvetica Neue", Arial, sans-serif';
  ctx.letterSpacing = '10px';
  ctx.fillText('30 DAYS', 512, 340);
});

const sameItem = (a: JarItem, b: JarItem) => a.shape === b.shape && a.tone === b.tone;

type JarSceneOptions = {
  reducedMotion: boolean;
  // GPU の負荷やメモリ不足で 3D 表示が止められたときに呼ぶ
  onContextLost: () => void;
};

export function createJarScene(container: HTMLElement, options: JarSceneOptions): JarSceneHandle {
  // スマホは GPU もメモリも小さい。重すぎると表示が止められ、しばらく 3D 自体が使えなくなるので軽くする
  const lowPower = window.matchMedia('(pointer: coarse)').matches;
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, lowPower ? 1.5 : 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = lowPower ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = environment;

  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
  const lookAt = new THREE.Vector3(0, 1.55, 0);

  scene.add(new THREE.HemisphereLight(0xffffff, 0xe3e7ec, 0.9));
  const sun = new THREE.DirectionalLight(0xffffff, 2.2);
  sun.position.set(3.5, 7, 4);
  sun.castShadow = true;
  sun.shadow.mapSize.setScalar(lowPower ? 512 : 1024);
  sun.shadow.camera.left = -3;
  sun.shadow.camera.right = 3;
  sun.shadow.camera.top = 3;
  sun.shadow.camera.bottom = -3;
  sun.shadow.radius = 6;
  scene.add(sun);

  const floor = new THREE.Mesh(new THREE.CircleGeometry(4, 48), new THREE.ShadowMaterial({ color: INK, opacity: 0.16 }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  // root は上下のゆれ、jar はドラッグ回転を担当する
  const root = new THREE.Group();
  const jar = new THREE.Group();
  root.add(jar);
  scene.add(root);

  // 瓶の断面（半径, 高さ）を回転させてガラス本体を作る
  const profile = [
    [0, 0], [0.92, 0], [1.1, 0.08], [1.16, 0.3], [1.16, 2.45], [1.08, 2.72],
    [0.9, 2.9], [0.84, 3.02], [0.84, 3.14],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  const glassGeometry = new THREE.LatheGeometry(profile, 72);
  // transmission だと中のコインが白くくすむので、薄い透明ガラス＋映り込みで表現する
  const glass = new THREE.Mesh(glassGeometry, new THREE.MeshPhysicalMaterial({
    color: 0xeef3f7,
    transparent: true,
    opacity: 0.2,
    roughness: 0.04,
    clearcoat: 1,
    clearcoatRoughness: 0.04,
    envMapIntensity: 1.6,
    depthWrite: false,
  }));
  const innerGlass = new THREE.Mesh(glassGeometry, new THREE.MeshStandardMaterial({
    color: 0xc9d6e0, transparent: true, opacity: 0.12, side: THREE.BackSide, depthWrite: false,
  }));
  jar.add(innerGlass, glass);

  // ハイライトは光源に対して固定なので、回転しない root 側に置く
  const shine = new THREE.Mesh(
    new THREE.CylinderGeometry(1.18, 1.18, 1.7, 12, 1, true, -0.62, 0.14),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, depthWrite: false }),
  );
  shine.position.y = 1.55;
  root.add(shine);

  const rim = new THREE.Mesh(
    new THREE.TorusGeometry(0.86, 0.075, 16, 72),
    new THREE.MeshStandardMaterial({ color: INK, roughness: 0.45 }),
  );
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 3.14;
  jar.add(rim);

  const base = new THREE.Mesh(
    new THREE.TorusGeometry(1.02, 0.05, 12, 72),
    new THREE.MeshStandardMaterial({ color: INK, roughness: 0.5 }),
  );
  base.rotation.x = Math.PI / 2;
  base.position.y = 0.05;
  jar.add(base);

  const labelMap = labelTexture();
  const label = new THREE.Mesh(
    new THREE.CylinderGeometry(1.175, 1.175, 0.95, 48, 1, true, -0.78, 1.56),
    new THREE.MeshStandardMaterial({ map: labelMap, roughness: 0.85 }),
  );
  label.position.y = 1.35;
  label.rotation.z = -0.02;
  jar.add(label);

  // ---- 瓶の中身：形ごとの見た目（形状は共通、色は品目ごとにマテリアルを分ける） ----
  const faceMap = coinFaceTexture();
  const geometries: Record<ItemShape, THREE.BufferGeometry> = {
    can: new THREE.CylinderGeometry(CAN_SIZE.radius, CAN_SIZE.radius, CAN_SIZE.height, 28),
    pack: new THREE.BoxGeometry(PACK_SIZE.width, PACK_SIZE.height, PACK_SIZE.depth),
    coin: new THREE.CylinderGeometry(COIN_SIZE.radius, COIN_SIZE.radius, COIN_SIZE.height, 32),
  };
  const lidMaterial = new THREE.MeshStandardMaterial({ color: 0xd4d9dc, metalness: 0.9, roughness: 0.28 });
  const textures: THREE.Texture[] = [faceMap];
  const coinMaterialsFor = (face: THREE.ColorRepresentation, edge: THREE.ColorRepresentation) => [
    new THREE.MeshStandardMaterial({ color: edge, metalness: 0.4, roughness: 0.35 }),
    new THREE.MeshStandardMaterial({ color: face, map: faceMap, metalness: 0.3, roughness: 0.38 }),
    new THREE.MeshStandardMaterial({ color: face, map: faceMap, metalness: 0.3, roughness: 0.38 }),
  ];
  const materialCache = new Map<string, THREE.Material[]>();
  const materialsFor = ({ shape, tone }: JarItem) => {
    const key = `${shape}-${tone}`;
    const cached = materialCache.get(key);
    if (cached) return cached;
    const hex = TONES[tone % TONES.length].hex;
    let materials: THREE.Material[];
    if (shape === 'can') {
      const map = canLabelTexture(hex);
      textures.push(map);
      // CylinderGeometry の面の順：胴・上面・底面
      materials = [new THREE.MeshStandardMaterial({ map, metalness: 0.45, roughness: 0.32 }), lidMaterial, lidMaterial];
    } else if (shape === 'pack') {
      const face = packFaceTexture(hex);
      const side = packSideTexture(hex);
      textures.push(face, side);
      const faceMaterial = new THREE.MeshStandardMaterial({ map: face, roughness: 0.55 });
      const sideMaterial = new THREE.MeshStandardMaterial({ map: side, roughness: 0.55 });
      // BoxGeometry の面の順：+x, -x, +y, -y, +z, -z
      const endMaterial = new THREE.MeshStandardMaterial({ color: new THREE.Color(hex).multiplyScalar(0.85), roughness: 0.55 });
      materials = [sideMaterial, sideMaterial, endMaterial, endMaterial, faceMaterial, faceMaterial];
    } else {
      materials = coinMaterialsFor(hex, new THREE.Color(hex).multiplyScalar(0.72));
    }
    materialCache.set(key, materials);
    return materials;
  };

  // ---- 物理演算：瓶の底と壁は動かない箱の組み合わせで作る（座標は瓶のローカル座標） ----
  const world = new CANNON.World({ gravity: new CANNON.Vec3(0, GRAVITY, 0), allowSleep: true });
  world.broadphase = new CANNON.SAPBroadphase(world);
  world.defaultContactMaterial.friction = 0.45;
  world.defaultContactMaterial.restitution = 0.22;
  const jarBody = new CANNON.Body({ mass: 0 });
  jarBody.addShape(new CANNON.Box(new CANNON.Vec3(1.4, 0.2, 1.4)), new CANNON.Vec3(0, -0.16, 0));
  const WALL_SEGMENTS = 24;
  const wallHalfWidth = (JAR_INNER_RADIUS + 0.2) * Math.tan(Math.PI / WALL_SEGMENTS) + 0.03;
  for (let index = 0; index < WALL_SEGMENTS; index += 1) {
    const angle = (index / WALL_SEGMENTS) * Math.PI * 2;
    // 高く積んだ初期配置がこぼれないよう、壁は見た目より高くしておく
    jarBody.addShape(
      new CANNON.Box(new CANNON.Vec3(0.2, 8, wallHalfWidth)),
      new CANNON.Vec3(Math.cos(angle) * (JAR_INNER_RADIUS + 0.2), 8, Math.sin(angle) * (JAR_INNER_RADIUS + 0.2)),
      new CANNON.Quaternion().setFromAxisAngle(new CANNON.Vec3(0, 1, 0), -angle),
    );
  }
  world.addBody(jarBody);

  // 当たり判定は軽さ優先。円柱どうしの衝突は重いので、缶は軸に沿って並べた球 3 つ、コインは薄い箱で近似する
  const addBodyShapes = (body: CANNON.Body, shape: ItemShape, scale: number) => {
    if (shape === 'can') {
      const radius = CAN_SIZE.radius * scale;
      const offset = CAN_SIZE.height / 2 * scale - radius;
      [-offset, 0, offset].forEach((y) => body.addShape(new CANNON.Sphere(radius), new CANNON.Vec3(0, y, 0)));
      return;
    }
    const size = shape === 'pack'
      ? [PACK_SIZE.width, PACK_SIZE.height, PACK_SIZE.depth]
      : [COIN_SIZE.radius * 2 * 0.9, COIN_SIZE.height, COIN_SIZE.radius * 2 * 0.9];
    body.addShape(new CANNON.Box(new CANNON.Vec3(size[0] / 2 * scale, size[1] / 2 * scale, size[2] / 2 * scale)));
  };
  // 寝かせたときの横幅と厚み（初期配置の間隔に使う）
  const footprint = (shape: ItemShape, scale: number) => {
    if (shape === 'can') return { length: CAN_SIZE.height * scale, thickness: CAN_SIZE.radius * 2 * scale };
    if (shape === 'pack') return { length: Math.hypot(PACK_SIZE.width, PACK_SIZE.height) * scale, thickness: PACK_SIZE.depth * scale };
    return { length: COIN_SIZE.radius * 2 * scale, thickness: COIN_SIZE.height * scale };
  };
  // 寝かせた向き：缶は横倒し、箱とコインは平置き。向きは Y 軸まわりにばらす
  const lyingQuaternion = (shape: ItemShape) => {
    const yaw = new CANNON.Quaternion().setFromAxisAngle(new CANNON.Vec3(0, 1, 0), Math.random() * Math.PI * 2);
    if (shape === 'coin') return yaw;
    return yaw.mult(new CANNON.Quaternion().setFromAxisAngle(new CANNON.Vec3(1, 0, 0), Math.PI / 2));
  };

  type Placed = { item: JarItem; mesh: THREE.Mesh; body: CANNON.Body };
  let placed: Placed[] = [];
  let pending: { item: JarItem; at: number }[] = [];
  let currentScale = 1;
  let initialized = false;
  let wobble = 0;
  const clock = new THREE.Clock();

  const randomQuaternion = () => new CANNON.Quaternion().setFromEuler(Math.random() * Math.PI * 2, Math.random() * Math.PI * 2, Math.random() * Math.PI * 2);

  const addItem = (item: JarItem, position: CANNON.Vec3, dropping: boolean, quaternion = randomQuaternion()) => {
    const mesh = new THREE.Mesh(geometries[item.shape], materialsFor(item));
    mesh.scale.setScalar(currentScale);
    mesh.castShadow = true;
    const body = new CANNON.Body({ mass: item.shape === 'coin' ? 0.4 : 1, position, quaternion });
    addBodyShapes(body, item.shape, currentScale);
    body.linearDamping = 0.1;
    body.angularDamping = 0.3;
    body.sleepSpeedLimit = 0.5;
    body.sleepTimeLimit = 0.3;
    if (dropping) {
      body.velocity.set((Math.random() - 0.5) * 0.6, -3, (Math.random() - 0.5) * 0.6);
      body.angularVelocity.set((Math.random() - 0.5) * 10, (Math.random() - 0.5) * 6, (Math.random() - 0.5) * 10);
      // 着地の衝撃で瓶を少し揺らす
      body.addEventListener('collide', (event: { contact: CANNON.ContactEquation }) => {
        const impact = Math.abs(event.contact.getImpactVelocityAlongNormal());
        if (impact > 3) wobble = Math.max(wobble, Math.min(0.03, impact * 0.0025));
      });
    }
    world.addBody(body);
    jar.add(mesh);
    placed.push({ item, mesh, body });
  };

  const removeFrom = (index: number) => {
    placed.slice(index).forEach(({ mesh, body }) => {
      world.removeBody(body);
      jar.remove(mesh);
    });
    placed = placed.slice(0, index);
    // 支えを失った物が宙に浮いたままにならないよう起こす
    placed.forEach(({ body }) => body.wakeUp());
  };

  const syncMeshes = () => {
    placed.forEach(({ mesh, body }) => {
      mesh.position.set(body.position.x, body.position.y, body.position.z);
      mesh.quaternion.set(body.quaternion.x, body.quaternion.y, body.quaternion.z, body.quaternion.w);
    });
  };

  // 画面に出す前に一気に落として積もらせる（読み込み時・大きさの変更時・動きを減らす設定のとき）
  // 寝かせた状態で低く密に並べる。あとは物理演算で自然に落ち着く
  const placeLying = (items: JarItem[]) => {
    const cell = Math.max(...items.map((item) => footprint(item.shape, currentScale).length)) + 0.02;
    const layerHeight = Math.max(...items.map((item) => footprint(item.shape, currentScale).thickness)) + 0.02;
    const reach = JAR_INNER_RADIUS - cell / 2;
    const cells: [number, number][] = [];
    for (let x = -reach; x <= reach + 1e-6; x += cell) {
      for (let z = -reach; z <= reach + 1e-6; z += cell) if (Math.hypot(x, z) <= reach) cells.push([x, z]);
    }
    if (!cells.length) cells.push([0, 0]);
    // 外側（ガラス越しに見える位置）から埋める。薄い箱やコインは缶に埋もれやすいので、各段で外側を優先して割り当てる
    cells.sort((a, b) => Math.hypot(b[0], b[1]) - Math.hypot(a[0], a[1]));
    const baseY = placed.reduce((top, { body }) => Math.max(top, body.position.y), 0) + layerHeight;
    for (let start = 0; start < items.length; start += cells.length) {
      const layer = start / cells.length;
      const chunk = items.slice(start, start + cells.length);
      // placed の並びは items と同じ順に保つ（差分の比較に使う）。位置の割り当てだけを並べ替える
      const byOuter = chunk.map((_, index) => index).sort((a, b) => Number(chunk[a].shape === 'can') - Number(chunk[b].shape === 'can'));
      const cellOf = new Map(byOuter.map((itemIndex, rank) => [itemIndex, cells[rank]]));
      chunk.forEach((item, index) => {
        const [x, z] = cellOf.get(index)!;
        addItem(item, new CANNON.Vec3(x, baseY + layer * layerHeight, z), false, lyingQuaternion(item.shape));
      });
    }
    if (options.reducedMotion) {
      // 動きを減らす設定では、落ち着くまで先に計算してから見せる
      for (let step = 0; step < 360; step += 1) {
        world.step(1 / 60);
        if (step % 20 === 19 && placed.every(({ body }) => body.sleepState === CANNON.Body.SLEEPING)) break;
      }
    }
    syncMeshes();
    markDirty();
  };

  // ---- 積もった位置の保存と復元：毎回計算し直すと数秒かかるので、落ち着いた状態を端末に残す ----
  const signatureOf = (items: JarItem[]) => items.map(({ shape, tone }) => `${shape[0]}${tone}`).join('');
  let poseDirty = false;
  let dirtySince = 0;
  const markDirty = () => {
    poseDirty = true;
    dirtySince = clock.getElapsedTime();
  };
  const savePoses = () => {
    try {
      window.localStorage.setItem(POSE_STORAGE_KEY, JSON.stringify({
        scale: currentScale,
        signature: signatureOf(placed.map(({ item }) => item)),
        poses: placed.map(({ body: { position: p, quaternion: q } }) => [p.x, p.y, p.z, q.x, q.y, q.z, q.w].map((value) => Math.round(value * 1e4) / 1e4)),
      }));
    } catch {
      // 保存できなくても次回に積もらせ直すだけなので無視する
    }
    poseDirty = false;
  };
  // 保存済みの配置のうち、今の中身と先頭から一致する分だけを復元し、復元できた個数を返す
  const restorePoses = (items: JarItem[]) => {
    try {
      const saved = JSON.parse(window.localStorage.getItem(POSE_STORAGE_KEY) ?? 'null') as { scale: number; signature: string; poses: number[][] } | null;
      if (!saved || Math.abs(saved.scale - currentScale) > 0.001) return 0;
      const signature = signatureOf(items);
      let count = 0;
      while (count < saved.poses.length && count < items.length && saved.signature.slice(count * 2, count * 2 + 2) === signature.slice(count * 2, count * 2 + 2)) count += 1;
      items.slice(0, count).forEach((item, index) => {
        const [x, y, z, qx, qy, qz, qw] = saved.poses[index];
        addItem(item, new CANNON.Vec3(x, y, z), false, new CANNON.Quaternion(qx, qy, qz, qw));
        placed[placed.length - 1].body.sleep();
      });
      syncMeshes();
      return count;
    } catch {
      return 0;
    }
  };

  const setItems = (items: JarItem[], scale: number, animate: boolean) => {
    const next = items.slice(0, MAX_ITEMS);
    // 大きさが変わったら（初回・設定の変更時）作り直す
    if (Math.abs(scale - currentScale) > 0.01 || !initialized) {
      initialized = true;
      currentScale = scale;
      pending = [];
      removeFrom(0);
      const restored = restorePoses(next);
      if (next.length > restored) placeLying(next.slice(restored));
      return;
    }
    // 形が同じで色だけ変わった物は、その場で塗り替える（設定で色を変えたとき）
    placed.forEach((entry, index) => {
      const target = next[index];
      if (target && target.shape === entry.item.shape && target.tone !== entry.item.tone) {
        entry.item = target;
        entry.mesh.material = materialsFor(target);
        markDirty();
      }
    });
    // 変わっていない先頭部分はそのまま。変わった所から先を取り除き、足りない分を入れる
    const queued = [...placed.map(({ item }) => item), ...pending.map(({ item }) => item)];
    let same = 0;
    while (same < queued.length && same < next.length && sameItem(queued[same], next[same])) same += 1;
    if (same < placed.length) markDirty();
    removeFrom(Math.min(same, placed.length));
    pending = [];
    const additions = next.slice(placed.length);
    if (!additions.length) return;
    markDirty();
    // 落とす演出は 1 日分程度まで。形の変更などで大量に入れ直すときは並べて積もらせる
    if (!animate || options.reducedMotion || additions.length > 15) {
      placeLying(additions);
      return;
    }
    const now = clock.getElapsedTime();
    const interval = Math.min(0.22, 2.2 / additions.length);
    pending = additions.map((item, index) => ({ item, at: now + index * interval }));
    wobble = Math.max(wobble, 0.012);
  };

  // ドラッグで瓶を回す（縦スクロールはブラウザに任せる）
  let rotation = 0.35;
  let velocity = 0;
  let dragging: { x: number; t: number } | null = null;
  let lastInteraction = -10;
  const pointer = new THREE.Vector2();
  const canvas = renderer.domElement;
  canvas.style.touchAction = 'pan-y';

  const onContextLost = (event: Event) => {
    event.preventDefault();
    renderer.setAnimationLoop(null);
    options.onContextLost();
  };
  canvas.addEventListener('webglcontextlost', onContextLost);

  const onPointerDown = (event: PointerEvent) => {
    dragging = { x: event.clientX, t: performance.now() };
    velocity = 0;
    canvas.setPointerCapture(event.pointerId);
    container.dataset.dragging = 'true';
  };
  const onPointerMove = (event: PointerEvent) => {
    const rect = canvas.getBoundingClientRect();
    pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, ((event.clientY - rect.top) / rect.height) * 2 - 1);
    if (!dragging) return;
    const now = performance.now();
    const delta = (event.clientX - dragging.x) * 0.012;
    rotation += delta;
    velocity = delta / Math.max(1, now - dragging.t) * 16;
    dragging = { x: event.clientX, t: now };
    lastInteraction = clock.getElapsedTime();
  };
  const onPointerUp = (event: PointerEvent) => {
    dragging = null;
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    delete container.dataset.dragging;
  };
  const onPointerLeave = () => pointer.set(0, 0);
  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', onPointerUp);
  canvas.addEventListener('pointerleave', onPointerLeave);

  const resize = () => {
    const { width, height } = container.getBoundingClientRect();
    if (!width || !height) return;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    // 縦長の画面でも瓶と飾りコインが収まるように引きで撮る
    camera.position.set(0, 3.5, camera.aspect < 0.9 ? 11.5 / camera.aspect ** 0.35 : 9.2);
    camera.updateProjectionMatrix();
  };
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(container);
  resize();

  let visible = true;
  const intersectionObserver = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; });
  intersectionObserver.observe(container);

  const tick = () => {
    const delta = Math.min(clock.getDelta(), 0.05);
    const time = clock.getElapsedTime();
    if (!visible) return;

    if (!dragging) {
      velocity *= 0.92;
      rotation += velocity;
      if (!options.reducedMotion && time - lastInteraction > 2.5) rotation += delta * 0.18;
    }
    jar.rotation.y = rotation;
    wobble *= 0.97;
    root.rotation.z = options.reducedMotion ? 0 : Math.sin(time * 14) * wobble;
    root.position.y = options.reducedMotion ? 0 : Math.sin(time * 1.25) * 0.04;

    if (pending.length) {
      const due = pending.filter(({ at }) => at <= time);
      pending = pending.filter(({ at }) => at > time);
      due.forEach(({ item }) => addItem(
        item,
        new CANNON.Vec3((Math.random() - 0.5) * 0.5, SPAWN_HEIGHT + Math.random() * 0.3, (Math.random() - 0.5) * 0.5),
        true,
      ));
    }
    world.step(1 / 60, delta, 2);
    syncMeshes();
    // 全部が止まったら（揺れが続いても 8 秒後には）配置を保存する
    if (poseDirty && !pending.length && (time - dirtySince > 8 || placed.every(({ body }) => body.sleepState === CANNON.Body.SLEEPING))) savePoses();

    camera.position.x += (pointer.x * 0.5 - camera.position.x) * 0.05;
    camera.lookAt(lookAt);
    renderer.render(scene, camera);
  };
  renderer.setAnimationLoop(tick);

  return {
    setItems,
    dispose: () => {
      renderer.setAnimationLoop(null);
      resizeObserver.disconnect();
      intersectionObserver.disconnect();
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointercancel', onPointerUp);
      canvas.removeEventListener('pointerleave', onPointerLeave);
      canvas.removeEventListener('webglcontextlost', onContextLost);
      removeFrom(0);
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          object.geometry.dispose();
          (Array.isArray(object.material) ? object.material : [object.material]).forEach((material) => material.dispose());
        }
      });
      Object.values(geometries).forEach((geometry) => geometry.dispose());
      materialCache.forEach((materials) => materials.forEach((material) => material.dispose()));
      [...textures, labelMap, environment].forEach((texture) => texture.dispose());
      pmrem.dispose();
      renderer.dispose();
      // dispose だけでは GPU のコンテキストがすぐには返されないので、明示的に手放す
      renderer.forceContextLoss();
      canvas.remove();
    },
  };
}
