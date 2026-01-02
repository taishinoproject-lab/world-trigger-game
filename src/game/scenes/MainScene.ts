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
  bullet: 0xffc857,
  bossBullet: 0xffb86b,
  boss: 0xff6b6b,
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

type WeaponType = "ASTEROID" | "METEORA";

export class MainScene extends Phaser.Scene {
  private player!: Phaser.GameObjects.Arc;
  private aimLine!: Phaser.GameObjects.Line;
  private bullets: Phaser.GameObjects.Arc[] = [];
  private bossBullets!: Phaser.Physics.Arcade.Group;
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private lastFiredAt = 0;
  private lastBossFiredAt = 0;
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

  constructor() {
    super("MainScene");
  }

  create() {
    this.cameras.main.setBackgroundColor(COLORS.background);

    this.player = this.add.circle(GAME_WIDTH / 2, GAME_HEIGHT / 2, PLAYER_RADIUS, COLORS.player);
    this.physics.add.existing(this.player);

    const playerBody = this.player.body as Phaser.Physics.Arcade.Body;
    playerBody.setCircle(PLAYER_RADIUS);
    playerBody.setAllowGravity(false);

    this.boss = this.add.circle(GAME_WIDTH / 2, 120, BOSS_RADIUS, COLORS.boss);
    this.physics.add.existing(this.boss);

    const bossBody = this.boss.body as Phaser.Physics.Arcade.Body;
    bossBody.setCircle(BOSS_RADIUS);
    bossBody.setImmovable(true);
    bossBody.setAllowGravity(false);

    this.aimLine = this.add.line(0, 0, 0, 0, 0, 0, COLORS.aim).setLineWidth(2, 2);

    this.keys = this.input.keyboard?.addKeys("W,A,S,D,ONE,TWO,R") as Record<
      string,
      Phaser.Input.Keyboard.Key
    >;

    this.bossBullets = this.physics.add.group();
    this.shieldGraphics = this.add.graphics();

    this.hpText = this.add.text(16, 16, `HP: ${this.hp}`, {
      fontFamily: "sans-serif",
      fontSize: "18px",
      color: COLORS.uiText,
    }).setScrollFactor(0);

    this.bossHpText = this.add.text(16, 40, this.getBossHpLabel(), {
      fontFamily: "sans-serif",
      fontSize: "18px",
      color: COLORS.uiText,
    }).setScrollFactor(0);

    this.weaponText = this.add.text(16, 64, this.getWeaponLabel(), {
      fontFamily: "sans-serif",
      fontSize: "18px",
      color: COLORS.uiText,
    }).setScrollFactor(0);

    this.shieldHpText = this.add.text(16, 88, this.getShieldHpLabel(), {
      fontFamily: "sans-serif",
      fontSize: "18px",
      color: COLORS.uiText,
    }).setScrollFactor(0);

    this.shieldStatusText = this.add.text(16, 112, "", {
      fontFamily: "sans-serif",
      fontSize: "18px",
      color: COLORS.uiText,
    }).setScrollFactor(0);

    this.input.keyboard?.on("keydown-ONE", () => {
      this.setWeapon("ASTEROID");
    });

    this.input.keyboard?.on("keydown-TWO", () => {
      this.setWeapon("METEORA");
    });

    this.input.keyboard?.on("keydown-R", () => {
      this.scene.restart();
    });
  }

  update(_: number, delta: number) {
    this.updateAim();
    this.updateShield(delta);

    if (!this.gameOver) {
      this.updateMovement(delta);
      this.handleFire();
    }

    if (!this.gameOver && !this.bossDefeated) {
      this.handleBossFire();
    }

    this.handleBulletBossCollisions();
    this.handleBossBulletPlayerCollisions();
    this.cleanupBullets();
    this.cleanupBossBullets();
  }

  private updateMovement(delta: number) {
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

    this.player.x = Phaser.Math.Clamp(
      this.player.x,
      PLAYER_RADIUS,
      GAME_WIDTH - PLAYER_RADIUS
    );
    this.player.y = Phaser.Math.Clamp(
      this.player.y,
      PLAYER_RADIUS,
      GAME_HEIGHT - PLAYER_RADIUS
    );
  }

  private updateAim() {
    const pointer = this.input.activePointer;
    const worldPoint = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
    const aimDirection = new Phaser.Math.Vector2(
      worldPoint.x - this.player.x,
      worldPoint.y - this.player.y
    );

    if (aimDirection.lengthSq() > 0) {
      aimDirection.normalize();
    }

    const aimEndX = this.player.x + aimDirection.x * AIM_LINE_LENGTH;
    const aimEndY = this.player.y + aimDirection.y * AIM_LINE_LENGTH;

    this.aimAngle = Phaser.Math.Angle.Between(this.player.x, this.player.y, worldPoint.x, worldPoint.y);
    this.aimLine.setTo(this.player.x, this.player.y, aimEndX, aimEndY);
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

    const bullet = this.add.circle(this.player.x, this.player.y, BULLET_RADIUS, COLORS.bullet);
    this.physics.add.existing(bullet);
    bullet.setData("weapon", this.weapon);

    const body = bullet.body as Phaser.Physics.Arcade.Body;
    body.setCircle(BULLET_RADIUS);
    body.setAllowGravity(false);
    body.setVelocity(direction.x * BULLET_SPEED, direction.y * BULLET_SPEED);

    this.bullets.push(bullet);
  }

  private handleBossFire() {
    const now = this.time.now;
    const fireInterval = 1000 / BOSS_FIRE_RATE;
    if (now - this.lastBossFiredAt < fireInterval) return;

    this.lastBossFiredAt = now;

    const direction = new Phaser.Math.Vector2(
      this.player.x - this.boss.x,
      this.player.y - this.boss.y
    );

    if (direction.lengthSq() === 0) return;

    direction.normalize();

    const bullet = this.add.circle(this.boss.x, this.boss.y, BOSS_BULLET_RADIUS, COLORS.bossBullet);
    this.physics.add.existing(bullet);

    const body = bullet.body as Phaser.Physics.Arcade.Body;
    body.setCircle(BOSS_BULLET_RADIUS);
    body.setAllowGravity(false);
    body.setVelocity(direction.x * BOSS_BULLET_SPEED, direction.y * BOSS_BULLET_SPEED);

    this.bossBullets.add(bullet);
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
      if (
        bullet.x < -BOSS_BULLET_RADIUS ||
        bullet.x > GAME_WIDTH + BOSS_BULLET_RADIUS ||
        bullet.y < -BOSS_BULLET_RADIUS ||
        bullet.y > GAME_HEIGHT + BOSS_BULLET_RADIUS
      ) {
        bullet.destroy();
      }
    }
  }

  private handleBulletBossCollisions() {
    if (this.bossDefeated) return;

    for (let i = this.bullets.length - 1; i >= 0; i -= 1) {
      const bullet = this.bullets[i];
      if (this.physics.overlap(bullet, this.boss)) {
        const weapon = bullet.getData("weapon") as WeaponType | undefined;
        bullet.destroy();
        this.bullets.splice(i, 1);
        if (weapon === "METEORA") {
          this.spawnMeteoraExplosion(bullet.x, bullet.y);
          this.applyBossDamage(METEORA_TO_BOSS);
        } else {
          this.applyBossDamage(ASTEROID_TO_BOSS);
        }
      }
    }
  }

  private handleBossBulletPlayerCollisions() {
    if (this.gameOver) return;

    const children = this.bossBullets.getChildren() as Phaser.GameObjects.Arc[];
    for (let i = children.length - 1; i >= 0; i -= 1) {
      const bullet = children[i];
      if (this.tryBlockBossBulletWithShield(bullet)) {
        continue;
      }

      if (this.physics.overlap(bullet, this.player)) {
        const multiplier = this.isShieldBroken() ? BOSS_DAMAGE_MULTIPLIER_WHILE_STUNNED : 1;
        const damage = Math.ceil(BOSS_BULLET_DAMAGE * multiplier);
        bullet.destroy();
        this.setHp(Math.max(0, this.hp - damage));
      }
    }
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
      bullet.destroy();
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
        this.boss.setFillStyle(COLORS.boss);
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
