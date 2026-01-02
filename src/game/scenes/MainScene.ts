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
  uiText: "#ffffff",
};

export class MainScene extends Phaser.Scene {
  private player!: Phaser.GameObjects.Arc;
  private aimLine!: Phaser.GameObjects.Line;
  private bullets: Phaser.GameObjects.Arc[] = [];
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private lastFiredAt = 0;
  private hp = 100;
  private hpText!: Phaser.GameObjects.Text;

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

    this.aimLine = this.add.line(0, 0, 0, 0, 0, 0, COLORS.aim).setLineWidth(2, 2);

    this.keys = this.input.keyboard?.addKeys("W,A,S,D,H,R") as Record<
      string,
      Phaser.Input.Keyboard.Key
    >;

    this.hpText = this.add.text(16, 16, `HP: ${this.hp}`, {
      fontFamily: "sans-serif",
      fontSize: "18px",
      color: COLORS.uiText,
    });

    this.input.keyboard?.on("keydown-H", () => {
      this.setHp(Math.max(0, this.hp - 10));
    });

    this.input.keyboard?.on("keydown-R", () => {
      this.setHp(100);
    });
  }

  update(_: number, delta: number) {
    this.updateMovement(delta);
    this.updateAim();
    this.handleFire();
    this.cleanupBullets();
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

    const body = bullet.body as Phaser.Physics.Arcade.Body;
    body.setCircle(BULLET_RADIUS);
    body.setAllowGravity(false);
    body.setVelocity(direction.x * BULLET_SPEED, direction.y * BULLET_SPEED);

    this.bullets.push(bullet);
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

  private setHp(value: number) {
    this.hp = value;
    this.hpText.setText(`HP: ${this.hp}`);
  }
}
