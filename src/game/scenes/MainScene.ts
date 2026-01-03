import Phaser from "phaser";
import {
  AIM_LINE_LENGTH,
  BULLET_RADIUS,
  BULLET_SPEED,
  FIRE_RATE,
  GAME_HEIGHT,
  GAME_WIDTH,
  PLAYER_RADIUS,
  PLAYER_SPEED,
} from "../config";

const COLORS = {
  background: 0x111111,
  player: 0x4cc3ff,
  aim: 0x8de3ff,
  playerBullet: 0xffc857,
  bossBullet: 0x74fffb,
  bossCore: 0xff6b6b,
  shield: 0x6bd6ff,
  uiText: "#ffffff",
};

const BOSS_RADIUS = 36;
const BOSS_MAX_HP = 120;
const ASTEROID_TO_BOSS = 8;
const METEORA_TO_BOSS = 5;
const METEORA_EXPLOSION_RADIUS = 70;
const BOSS_BULLET_RADIUS = 5;
const BOSS_BULLET_SPEED = 480;
const BOSS_FIRE_RATE = 1.8;
const BOSS_BULLET_DAMAGE = 10;
const SHIELD_HP_MAX = 80;
const SHIELD_RADIUS = 100;
const SHIELD_ARC_DEG = 100;
const SHIELD_FOLLOW_DEG_PER_SEC = 180;
const SHIELD_BLOCK_DAMAGE = 6;
const SHIELD_STUN_DURATION = 2.0;
const BOSS_DAMAGE_MULTIPLIER_WHILE_STUNNED = 1.6;
const DEBUG = true; // チE��チE��ログを有効にする場合�E true に設宁E

type WeaponType = "ASTEROID" | "METEORA";

export class MainScene extends Phaser.Scene {
  private player!: Phaser.GameObjects.Arc;
  private aimLine!: Phaser.GameObjects.Line;
  private bullets: Phaser.GameObjects.Arc[] = [];
  private bossBullets!: Phaser.Physics.Arcade.Group;
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private lastFiredAt = 0;
  private hp = 100;
  private hpText!: Phaser.GameObjects.Text;
  private boss!: Phaser.GameObjects.Arc;
  private bossHp = BOSS_MAX_HP;
  private bossHpText!: Phaser.GameObjects.Text;
  private bossDefeated = false;
  private weapon: WeaponType = "ASTEROID";
  private weaponText!: Phaser.GameObjects.Text;
  private shieldGraphics!: Phaser.GameObjects.Graphics;
  private shieldHp = SHIELD_HP_MAX;
  private shieldHpText!: Phaser.GameObjects.Text;
  private shieldStatusText!: Phaser.GameObjects.Text;
  private shieldAngle = 0;
  private aimAngle = 0;
  private shieldBrokenUntil = 0;
  private gameOver = false;
  private bossFireTimer?: Phaser.Time.TimerEvent;
  private bossBulletCountText?: Phaser.GameObjects.Text;
  private bossBulletPlayerOverlap?: Phaser.Physics.Arcade.Collider;
  private _dbgBossBulletT = 0;

  constructor() {
    super("MainScene");
  }
// ✅ この create() を MainScene.ts の create() に「丸ごと置き換え」
// 目的：player / boss を create() で必ず生成 → bossBullets overlap を確実に登録 → タイマーで発射

create() {
  console.log("[PATCH_MARKER] MainScene create reached 2026-01-03-v2");

  // 1) 数値・フラグだけ初期化（GameObject は触らない）
  this.resetState();
  // --- ここを resetState() の直後に追加 ---
  if (this.player) this.player.destroy();


  this.player = this.add.circle(
    GAME_WIDTH / 2,
    GAME_HEIGHT / 2,
    PLAYER_RADIUS,
    COLORS.player
  );
  this.physics.add.existing(this.player);

  const playerBody = this.player.body as Phaser.Physics.Arcade.Body;
  playerBody.setCircle(PLAYER_RADIUS);
  playerBody.setAllowGravity(false);
  playerBody.enable = true;

  if (DEBUG) console.log("[DEBUG] player created", this.player.x, this.player.y);
// --- 追加ここまで ---


  // 2) 背景
  this.cameras.main.setBackgroundColor(COLORS.background);

  // 3) 入力
  this.keys = this.input.keyboard?.addKeys("W,A,S,D,ONE,TWO,R") as Record<
    string,
    Phaser.Input.Keyboard.Key
  >;
  this.input.keyboard?.addCapture([
    Phaser.Input.Keyboard.KeyCodes.W,
    Phaser.Input.Keyboard.KeyCodes.A,
    Phaser.Input.Keyboard.KeyCodes.S,
    Phaser.Input.Keyboard.KeyCodes.D,
    Phaser.Input.Keyboard.KeyCodes.ONE,
    Phaser.Input.Keyboard.KeyCodes.TWO,
    Phaser.Input.Keyboard.KeyCodes.R,
  ]);
  this.input.mouse?.disableContextMenu();

  // 4) 画面上の Graphics（毎回作り直し）
  if (this.aimLine && this.aimLine.active) this.aimLine.destroy();
  this.aimLine = this.add.line(0, 0, 0, 0, 0, 0, COLORS.aim).setLineWidth(2, 2);

  if (this.shieldGraphics && this.shieldGraphics.active) this.shieldGraphics.destroy();
  this.shieldGraphics = this.add.graphics();

  // 5) ✅ Player を create() で生成（updateMovement() で destroy/再生成しない）
  if (this.player && this.player.active) this.player.destroy();
  this.player = this.add.circle(GAME_WIDTH / 2, GAME_HEIGHT / 2, PLAYER_RADIUS, COLORS.player);
  this.physics.add.existing(this.player);
  {
    const body = this.player.body as Phaser.Physics.Arcade.Body;
    body.setCircle(PLAYER_RADIUS);
    body.setAllowGravity(false);
    body.setCollideWorldBounds(true);
    body.enable = true;
  }

  // 6) ✅ Boss を create() で生成（updateMovement() で destroy/再生成しない）
  if (this.boss && this.boss.active) this.boss.destroy();
  this.boss = this.add.circle(GAME_WIDTH / 2, 120, BOSS_RADIUS, COLORS.bossCore);
  this.physics.add.existing(this.boss);
  {
    const body = this.boss.body as Phaser.Physics.Arcade.Body;
    body.setCircle(BOSS_RADIUS);
    body.setImmovable(true);
    body.setAllowGravity(false);
    body.enable = true;
  }
  this.boss.setVisible(true);

  // 7) ✅ Boss bullets group（作ってから overlap 登録）
  if (this.bossBullets) {
    try {
      this.bossBullets.clear(true, true);
    } catch (e) {
      if (DEBUG) console.log("[DEBUG] bossBullets.clear() failed, recreating group");
    }
  }
  this.bossBullets = this.physics.add.group();
  if (DEBUG) console.log("[DEBUG] bossBullets group created");

  // ★ここ重要：player が存在してから呼ぶ
  this.registerBossBulletOverlap();

  // 8) UI テキスト
  if (this.hpText && this.hpText.active) this.hpText.destroy();
  this.hpText = this.add
    .text(16, 16, `HP: ${this.hp}`, {
      fontFamily: "sans-serif",
      fontSize: "18px",
      color: COLORS.uiText,
    })
    .setScrollFactor(0);

  if (this.bossHpText && this.bossHpText.active) this.bossHpText.destroy();
  this.bossHpText = this.add
    .text(16, 40, this.getBossHpLabel(), {
      fontFamily: "sans-serif",
      fontSize: "18px",
      color: COLORS.uiText,
    })
    .setScrollFactor(0);

  if (this.weaponText && this.weaponText.active) this.weaponText.destroy();
  this.weaponText = this.add
    .text(16, 64, this.getWeaponLabel(), {
      fontFamily: "sans-serif",
      fontSize: "18px",
      color: COLORS.uiText,
    })
    .setScrollFactor(0);

  if (this.shieldHpText && this.shieldHpText.active) this.shieldHpText.destroy();
  this.shieldHpText = this.add
    .text(16, 88, this.getShieldHpLabel(), {
      fontFamily: "sans-serif",
      fontSize: "18px",
      color: COLORS.uiText,
    })
    .setScrollFactor(0);

  if (this.shieldStatusText && this.shieldStatusText.active) this.shieldStatusText.destroy();
  this.shieldStatusText = this.add
    .text(16, 112, "", {
      fontFamily: "sans-serif",
      fontSize: "18px",
      color: COLORS.uiText,
    })
    .setScrollFactor(0);

  // デバッグ表示（任意）
  if (DEBUG) {
    if (this.bossBulletCountText && this.bossBulletCountText.active) this.bossBulletCountText.destroy();
    this.bossBulletCountText = this.add
      .text(GAME_WIDTH - 200, 16, "Boss Bullets: 0", {
        fontFamily: "sans-serif",
        fontSize: "16px",
        color: COLORS.uiText,
      })
      .setScrollFactor(0);
  }

  // 9) 武器切り替え / リスタート
  this.input.keyboard?.on("keydown-ONE", () => this.setWeapon("ASTEROID"));
  this.input.keyboard?.on("keydown-TWO", () => this.setWeapon("METEORA"));
  this.input.keyboard?.on("keydown-R", () => this.scene.restart());

  // 10) ✅ ボス発射タイマー（create で必ず登録）
  if (this.bossFireTimer) {
    this.bossFireTimer.remove();
    this.bossFireTimer = undefined;
  }

  const fireInterval = 1000 / BOSS_FIRE_RATE;
  this.bossFireTimer = this.time.addEvent({
    delay: fireInterval,
    loop: true,
    callback: () => {
      if (!this.gameOver && !this.bossDefeated && this.boss && this.boss.active) {
        this.handleBossFire();
        if (DEBUG) console.log("[DEBUG] Boss fired bullet");
      }
    },
    callbackScope: this,
  });
  if (DEBUG) console.log("[DEBUG] Boss fire timer registered");
}

// ✅ これとは別に必須：updateMovement() の中にある「player/boss の destroy + add.circle + physics.add.existing」
// を全部削除して、移動だけに戻すこと。そこが残ってるとまた即死する。

    private resetState() {
    // ゲーム進行フラグ
    this.gameOver = false;
    this.bossDefeated = false;

    // 既存�E配�E/参�Eを�E期化�E�存在するも�EだけでOK�E�E
    this.aimAngle = 0;
    this.shieldAngle = 0;
    this.shieldBrokenUntil = 0;
    this.lastFiredAt = 0;

    // プレイヤー弾配�Eをクリア�E�EameObjectはdestroy済みを想定！E
    // 既存�E弾を安�Eに破壁E
    if (this.bullets) {
      for (const bullet of this.bullets) {
        if (bullet && bullet.active) {
          bullet.destroy();
        }
      }
    }
    this.bullets = [];

    // HP系�E�正しいプロパティ名を使用�E�E
    this.hp = 100;
    this.bossHp = BOSS_MAX_HP;
    this.shieldHp = SHIELD_HP_MAX;

    // 武器
    this.weapon = "ASTEROID";

    // UIチE��スト�E create() で再生成されるため、ここでは更新しなぁE

    if (DEBUG) {
      console.log("[DEBUG] State reset");
    }
  }

  update(_: number, delta: number) {
    this.updateAim();
    this.updateShield(delta);
    this.debugBossBulletMovement(delta);
    if (DEBUG && this.bossBulletCountText) {
      this.bossBulletCountText.setText(`Boss Bullets: ${this.bossBullets.countActive(true)}`);
    }

    if (!this.gameOver) {
      this.updateMovement(delta);
      this.handleFire();
    }

    // ボス発封E�Eタイマ�Eで自動実行されるため、ここでは呼ばなぁE

    this.handleBulletBossCollisions();
    this.handleBossBulletPlayerCollisions();
    this.cleanupBullets();
    if (!this.gameOver) {
      this.cleanupBossBullets();
    }
  }

  private _dbgBossBulletT = 0;

  private debugBossBulletMovement(_delta: number) {
    if (!DEBUG || !this.bossBullets) return;
  
    const now = this.time.now;
    if (now - this._dbgBossBulletT < 500) return;
    this._dbgBossBulletT = now;
  
    const children = this.bossBullets.getChildren() as Phaser.GameObjects.Arc[];
    const active = children.filter((b) => b && b.active);
  
    if (active.length === 0) return;
  
    const first = active[0];
    const last = active[active.length - 1];
  
    const fb = first.body as Phaser.Physics.Arcade.Body | undefined;
    const lb = last.body as Phaser.Physics.Arcade.Body | undefined;
  
    const fvx = fb ? fb.velocity.x : 0;
    const fvy = fb ? fb.velocity.y : 0;
    const lvx = lb ? lb.velocity.x : 0;
    const lvy = lb ? lb.velocity.y : 0;
  
    const firstId = first.getData("id") ?? "?";
    const lastId = last.getData("id") ?? "?";
  
    console.log(
      `[PATCH v3] bossBullets first#${firstId} pos=(${first.x.toFixed(1)},${first.y.toFixed(1)}) v=(${fvx.toFixed(1)},${fvy.toFixed(1)}) | last#${lastId} pos=(${last.x.toFixed(1)},${last.y.toFixed(1)}) v=(${lvx.toFixed(1)},${lvy.toFixed(1)}) size=${active.length}`
    );
  }
  
  private updateMovement(delta: number) {
    if (!this.player || !this.player.active) return;
  
    const direction = new Phaser.Math.Vector2(0, 0);
    if (this.keys.W.isDown) direction.y -= 1;
    if (this.keys.S.isDown) direction.y += 1;
    if (this.keys.A.isDown) direction.x -= 1;
    if (this.keys.D.isDown) direction.x += 1;
  
    if (direction.lengthSq() > 0) {
      direction.normalize();
      const distance = (PLAYER_SPEED * delta) / 1000;
      this.player.x += direction.x * distance;
      this.player.y += direction.y * distance;
    }
  
    this.player.x = Phaser.Math.Clamp(this.player.x, PLAYER_RADIUS, GAME_WIDTH - PLAYER_RADIUS);
    this.player.y = Phaser.Math.Clamp(this.player.y, PLAYER_RADIUS, GAME_HEIGHT - PLAYER_RADIUS);
  
    const playerBody = this.player.body as Phaser.Physics.Arcade.Body | undefined;
    if (playerBody) playerBody.updateFromGameObject();
  }
  
  

  private updateAim() {
    // player がいない/死んでるなら何もしない（落ちないのが正義）
    if (!this.player || !this.player.active) return;
  
    // input がまだ用意できてないケースも一応ガード
    const pointer = this.input?.activePointer;
    if (!pointer) return;
  
    const mx = pointer.worldX;
    const my = pointer.worldY;
  
    this.aimAngle = Phaser.Math.Angle.Between(this.player.x, this.player.y, mx, my);
  
    // aimLine が無いなら描かない（安全側）
    if (!this.aimLine) return;
  
    const len = 40;
    this.aimLine.setTo(
      this.player.x,
      this.player.y,
      this.player.x + Math.cos(this.aimAngle) * len,
      this.player.y + Math.sin(this.aimAngle) * len
    );
  }
  
  private handleFire() {
    const pointer = this.input.activePointer;
    if (!pointer.isDown) return;

    const now = this.time.now;
    const fireInterval = 1000 / FIRE_RATE;
    if (now - this.lastFiredAt < fireInterval) return;

    this.lastFiredAt = now;

    const worldPoint = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
    const direction = new Phaser.Math.Vector2(
      worldPoint.x - this.player.x,
      worldPoint.y - this.player.y
    );

    if (direction.lengthSq() === 0) return;

    direction.normalize();

    const bullet = this.add.circle(this.player.x, this.player.y, BULLET_RADIUS, COLORS.playerBullet);
    this.physics.add.existing(bullet);
    bullet.setData("weapon", this.weapon);

    const body = bullet.body as Phaser.Physics.Arcade.Body;
    body.setCircle(BULLET_RADIUS);
    body.setAllowGravity(false);
    body.setVelocity(direction.x * BULLET_SPEED, direction.y * BULLET_SPEED);

    this.bullets.push(bullet);
  }

  private handleBossFire() {
    if (!this.boss || !this.boss.active || !this.player || !this.player.active) {
      if (DEBUG) {
        console.log("[DEBUG] Boss fire skipped: boss or player not active");
      }
      return;
    }

    const direction = new Phaser.Math.Vector2(
      this.player.x - this.boss.x,
      this.player.y - this.boss.y
    );

    if (direction.lengthSq() === 0) {
      if (DEBUG) {
        console.log("[DEBUG] Boss fire skipped: zero direction");
      }
      return;
    }

    direction.normalize();

    const bullet = this.add.circle(this.boss.x, this.boss.y, BOSS_BULLET_RADIUS, COLORS.bossBullet);
    this.physics.add.existing(bullet);

    // 先に group に入れる（ここが超重要）
    this.bossBullets.add(bullet);
    
    const body = bullet.body as Phaser.Physics.Arcade.Body;
    body.setCircle(BOSS_BULLET_RADIUS);
    body.setAllowGravity(false);
    body.moves = true;
    body.enable = true;
    
    // 最後に速度（ここが超重要）
    body.setVelocity(direction.x * BOSS_BULLET_SPEED, direction.y * BOSS_BULLET_SPEED);
    
    // ついでに「嘘つけないログ」もここに
    if (DEBUG) {
      const id = bullet.getData("id") ?? "?";
      console.log(
        `[PATCH v3] bossBullet#${id} after setVelocity v=(${body.velocity.x.toFixed(1)},${body.velocity.y.toFixed(1)}) moves=${body.moves} enable=${body.enable}`
      );
    }

  }
  private cleanupBullets() {
    for (let i = this.bullets.length - 1; i >= 0; i -= 1) {
      const bullet = this.bullets[i];
      if (
        bullet.x < -BULLET_RADIUS ||
        bullet.x > GAME_WIDTH + BULLET_RADIUS ||
        bullet.y < -BULLET_RADIUS ||
        bullet.y > GAME_HEIGHT + BULLET_RADIUS
      ) {
        bullet.destroy();
        this.bullets.splice(i, 1);
      }
    }
  }

  private cleanupBossBullets() {
    const children = this.bossBullets.getChildren() as Phaser.GameObjects.Arc[];
    for (let i = children.length - 1; i >= 0; i -= 1) {
      const bullet = children[i];
      if (!bullet || !bullet.active) {
        if (bullet) {
          this.destroyBossBullet(bullet);
        }
        continue;
      }

      // 画面外判定（�Eージンを大きく取る�E�E
      const margin = BOSS_BULLET_RADIUS * 2;
      if (
        bullet.x < -margin ||
        bullet.x > GAME_WIDTH + margin ||
        bullet.y < -margin ||
        bullet.y > GAME_HEIGHT + margin
      ) {
        if (DEBUG) {
          console.log(`[DEBUG] Boss bullet destroyed (offscreen): (${bullet.x.toFixed(1)}, ${bullet.y.toFixed(1)})`);
        }
        this.destroyBossBullet(bullet);
      }
    }
  }

  private destroyBossBullet(bullet: Phaser.GameObjects.Arc) {
    if (!bullet) return;
    if (this.bossBullets) {
      this.bossBullets.remove(bullet, true, true);
      return;
    }
    bullet.destroy();
  }

  private registerBossBulletOverlap() {
    if (!this.player || !this.bossBullets) return;
    if (this.bossBulletPlayerOverlap) {
      this.bossBulletPlayerOverlap.destroy();
      this.bossBulletPlayerOverlap = undefined;
    }
    this.bossBulletPlayerOverlap = this.physics.add.overlap(
      this.bossBullets,
      this.player,
      (obj1, _obj2) => {
        const bullet = obj1 as Phaser.GameObjects.Arc;
        if (!bullet || !bullet.active || this.gameOver) return;
        if (this.tryBlockBossBulletWithShield(bullet)) {
          if (DEBUG) {
            console.log("[DEBUG] Boss bullet blocked by shield");
          }
          return;
        }
        const multiplier = this.isShieldBroken() ? BOSS_DAMAGE_MULTIPLIER_WHILE_STUNNED : 1;
        const damage = Math.ceil(BOSS_BULLET_DAMAGE * multiplier);
        const oldHp = this.hp;
        bullet.destroy();
        this.setHp(Math.max(0, this.hp - damage));
        if (DEBUG) {
          console.log(`[DEBUG] Boss bullet hit player! Damage: ${damage}, HP: ${oldHp} -> ${this.hp}`);
        }
      },
      undefined,
      this
    );
  }

  private handleBulletBossCollisions() {
    if (this.bossDefeated || !this.boss || !this.boss.active) {
      if (DEBUG && this.bullets.length > 0) {
        console.log(`[DEBUG] Boss collision skipped: bossDefeated=${this.bossDefeated}, boss.active=${this.boss?.active}`);
      }
      return;
    }

    const bossBody = this.boss.body as Phaser.Physics.Arcade.Body;
    if (!bossBody || !bossBody.enable) {
      if (DEBUG && this.bullets.length > 0) {
        console.log(`[DEBUG] Boss collision skipped: body not enabled (bossBody=${!!bossBody}, enable=${bossBody?.enable})`);
      }
      return;
    }

    if (DEBUG && this.bullets.length > 0) {
      // 最初�E弾がある時だけログ�E�スパム防止�E�E
      const firstBullet = this.bullets[0];
      if (firstBullet && firstBullet.active) {
        const distance = Phaser.Math.Distance.Between(firstBullet.x, firstBullet.y, this.boss.x, this.boss.y);
        if (distance < 100) {
          console.log(`[DEBUG] Checking collision: bullet at (${firstBullet.x.toFixed(1)}, ${firstBullet.y.toFixed(1)}), boss at (${this.boss.x}, ${this.boss.y}), distance=${distance.toFixed(1)}`);
        }
      }
    }

    for (let i = this.bullets.length - 1; i >= 0; i -= 1) {
      const bullet = this.bullets[i];
      if (!bullet || !bullet.active) continue;

      if (this.physics.overlap(bullet, this.boss)) {
        const weapon = bullet.getData("weapon") as WeaponType | undefined;
        const hitX = bullet.x;
        const hitY = bullet.y;
        bullet.destroy();
        this.bullets.splice(i, 1);
        if (weapon === "METEORA") {
          this.spawnMeteoraExplosion(hitX, hitY);
          this.applyBossDamage(METEORA_TO_BOSS);
        } else {
          this.applyBossDamage(ASTEROID_TO_BOSS);
        }
        if (DEBUG) {
          console.log(`[DEBUG] Player bullet hit boss (${weapon}), boss HP: ${this.bossHp}`);
        }
      }
    }
  }

  private handleBossBulletPlayerCollisions() {
    return;
  }

  private tryBlockBossBulletWithShield(bullet: Phaser.GameObjects.Arc) {
    if (this.isShieldBroken()) return false;

    const distance = Phaser.Math.Distance.Between(
      this.player.x,
      this.player.y,
      bullet.x,
      bullet.y
    );

    if (distance > SHIELD_RADIUS) return false;

    const angleToBullet = Phaser.Math.Angle.Between(
      this.player.x,
      this.player.y,
      bullet.x,
      bullet.y
    );
    const halfArc = Phaser.Math.DegToRad(SHIELD_ARC_DEG / 2);
    const delta = Phaser.Math.Angle.Wrap(angleToBullet - this.shieldAngle);

    if (Math.abs(delta) <= halfArc) {
      this.destroyBossBullet(bullet);
      this.setShieldHp(this.shieldHp - SHIELD_BLOCK_DAMAGE);
      return true;
    }

    return false;
  }

  private updateShield(delta: number) {
    const now = this.time.now;
    if (this.shieldBrokenUntil > 0 && now >= this.shieldBrokenUntil) {
      this.shieldBrokenUntil = 0;
      this.setShieldHp(SHIELD_HP_MAX);
      this.shieldStatusText.setText("");
    }

    const targetAngle = this.aimAngle;
    const maxStep = Phaser.Math.DegToRad(SHIELD_FOLLOW_DEG_PER_SEC) * (delta / 1000);
    const deltaAngle = Phaser.Math.Angle.Wrap(targetAngle - this.shieldAngle);
    this.shieldAngle += Phaser.Math.Clamp(deltaAngle, -maxStep, maxStep);

    this.drawShield();
  }

  private drawShield() {
    if (this.isShieldBroken()) {
      this.shieldGraphics.clear();
      return;
    }

    const halfArc = Phaser.Math.DegToRad(SHIELD_ARC_DEG / 2);
    const startAngle = this.shieldAngle - halfArc;
    const endAngle = this.shieldAngle + halfArc;

    this.shieldGraphics.clear();
    this.shieldGraphics.fillStyle(COLORS.shield, 0.2);
    this.shieldGraphics.lineStyle(2, COLORS.shield, 0.9);
    this.shieldGraphics.beginPath();
    this.shieldGraphics.moveTo(this.player.x, this.player.y);
    this.shieldGraphics.arc(this.player.x, this.player.y, SHIELD_RADIUS, startAngle, endAngle, false);
    this.shieldGraphics.closePath();
    this.shieldGraphics.fillPath();
    this.shieldGraphics.strokePath();
  }

  private isShieldBroken() {
    return this.shieldBrokenUntil > 0;
  }

  private setShieldHp(value: number) {
    const next = Math.max(0, Math.min(SHIELD_HP_MAX, value));
    this.shieldHp = next;
    this.shieldHpText.setText(this.getShieldHpLabel());

    if (next <= 0) {
      this.shieldBrokenUntil = this.time.now + SHIELD_STUN_DURATION * 1000;
      this.shieldStatusText.setText("SHIELD BROKEN");
    }
  }

  private spawnMeteoraExplosion(x: number, y: number) {
    const explosion = this.add.graphics();
    explosion.fillStyle(0xfff1a8, 0.5);
    explosion.fillCircle(x, y, METEORA_EXPLOSION_RADIUS);
    this.tweens.add({
      targets: explosion,
      alpha: 0,
      duration: 250,
      onComplete: () => explosion.destroy(),
    });
  }

  private setHp(value: number) {
    this.hp = value;
    this.hpText.setText(`HP: ${this.hp}`);

    if (this.hp <= 0 && !this.gameOver) {
      this.gameOver = true;
      this.add
        .text(GAME_WIDTH / 2, GAME_HEIGHT / 2, "GAME OVER", {
          fontFamily: "sans-serif",
          fontSize: "32px",
          color: COLORS.uiText,
        })
        .setOrigin(0.5, 0.5)
        .setScrollFactor(0);
    }
  }

  private setBossHp(value: number) {
    if (this.bossDefeated) return;

    this.bossHp = Math.max(0, value);
    this.bossHpText.setText(this.getBossHpLabel());

    if (this.bossHp <= 0) {
      this.bossDefeated = true;
      this.boss.setVisible(false);
      const bossBody = this.boss.body as Phaser.Physics.Arcade.Body;
      bossBody.enable = false;
      this.add
        .text(GAME_WIDTH / 2, 80, "BOSS DOWN", {
          fontFamily: "sans-serif",
          fontSize: "28px",
          color: COLORS.uiText,
        })
        .setOrigin(0.5, 0.5)
        .setScrollFactor(0);
      this.bossHpText.setText("BOSS DOWN");
    }
  }

  private applyBossDamage(amount: number) {
    this.flashBoss();
    this.setBossHp(this.bossHp - amount);
  }

  private flashBoss() {
    if (!this.boss.active) return;
    this.boss.setFillStyle(0xffffff);
    this.time.delayedCall(80, () => {
      if (this.boss.active) {
        this.boss.setFillStyle(COLORS.bossCore);
      }
    });
  }

  private setWeapon(weapon: WeaponType) {
    this.weapon = weapon;
    this.weaponText.setText(this.getWeaponLabel());
  }

  private getBossHpLabel() {
    return `BOSS HP: ${this.bossHp}/${BOSS_MAX_HP}`;
  }

  private getWeaponLabel() {
    return `WEAPON: ${this.weapon}`;
  }

  private getShieldHpLabel() {
    return `SHIELD: ${this.shieldHp}/${SHIELD_HP_MAX}`;
  }
}
