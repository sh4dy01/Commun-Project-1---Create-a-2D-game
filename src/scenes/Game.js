//@ts-check
import Phaser from "phaser";

import PlayerManager from "../classes/PlayerManager"
import SceneManager from "../classes/SceneManager";
import CollisionManager from "../classes/CollisionManager";
import EnemyManager from "../classes/EnemyManager";
import UIManager from "../classes/UIManager";
import BossManager from "../classes/BossManager";
import ObjectLoader from "../loaders/ObjectLoaders";

import { CreatePurplePhantomAnims, CreateGreenPhantomAnims, CreateRedPhantomAnims } from "../animations/PhantomsAnimations";
import { ConvertXCartesianToIsometric, ConvertYCartesianToIsometric } from "../helpers/CartesianToIsometric";
import { GREEN, PLAYER_SIZE, PURPLE, RED } from "../helpers/Constants";
import { CreatePlayerAnims } from "../animations/PlayerAnimations";
import { ChangeDepth } from "../helpers/Utilities";
import SoundManager from "../classes/SoundManager";

export default class Game extends Phaser.Scene {
    constructor(){
        super('game')
    }
    
    /**
     * @param {{ level: Number; remainingLife: Number}} data
    */
    init(data) {
        this.currentLevel = data.level;
        this.currentLives = data.remainingLife;
        /**
         * @type {Phaser.Physics.Matter.Sprite[]}
        */
        this.enemies = [];

        /**
         * @type {Boolean[]}
        */
        this.leversUI = [];
        /**
         * @type {Phaser.GameObjects.Image[]}
        */
        this.levers = [];

        /**
         * @type {Phaser.Physics.Matter.Image[]}
        */
        this.boxes = [];
         
        this.spawnPoint = null
        /**
         * @type {EnemyManager[]}
        */
        this.enemiesAIManager = [];

        this.sceneManager = new SceneManager(this.scene, this.currentLevel, this.cameras.main);
        this.UIManager = new UIManager(data.level, data.remainingLife, this.add, this.scale.width, this.scale.height, this.leversUI, this.levers);
        this.soundManager = new SoundManager(this.sound);
        this.playerManager = new PlayerManager(data.remainingLife, this.sceneManager, this.UIManager, this.soundManager);
        this.collisionManager = new CollisionManager(this.matter.world, this.playerManager, this.sceneManager, this.soundManager)
    }

    create() {
        if (!this.sound.get('main').isPlaying) {
            this.soundManager.ambientMusic.play()
        }
        if (this.sound.get('ambiant_sfx')) {
            this.sound.get('ambiant_sfx').stop()
        }

        const map = this.add.tilemap("map"+this.currentLevel);  // Ajoute les emplacements des tiles dans le jeu
        const colliders = this.cache.json.get('colliders'); // Récupère toutes les collisions pour les sprites

        this.objectLoader = new ObjectLoader(map, this.matter, colliders, this.time, this.boxes, this.levers, this.leversUI, this.enemies, this.enemiesAIManager)

        this.cameras.main.fadeIn(2000, 0, 0, 0);
        this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_IN_COMPLETE, () => {
            this.playerManager.canMove = true
        })
        
        if ( this.currentLevel === 8 || this.currentLevel === 0){
            if (this.currentLevel === 8) {
                const Boss = map.filterObjects('Specials', (obj) => obj.name === 'boss')[0]; // Récupère l'emplacement de spawn du joueur depuis Tiled
                this.boss = new BossManager({
                    scene: this,
                    x: ConvertXCartesianToIsometric(Boss.x, Boss.y),
                    y: ConvertYCartesianToIsometric(Boss.x, Boss.y),
                    texture: 'boss',
                    frame: 'bottom.png'
                }, colliders, this.soundManager.bossSound)
                this.soundManager.bossSound.play()

                const entrance = map.filterObjects('Specials', (obj) => obj.name === 'entrance')[0];        
                this.entrance = this.matter.add.image(
                    ConvertXCartesianToIsometric(entrance.x, entrance.y),
                    ConvertYCartesianToIsometric(entrance.x, entrance.y),
                    'boss',
                    'closed.png'
                )
                this.entrance.setDepth(this.entrance.y)
                this.entrance.setBody(colliders.open)
                this.entrance.isSensor()
                this.playerManager.exitDoor = this.entrance

            } else if (this.currentLevel === 0) {
                const entrance = map.filterObjects('Specials', (obj) => obj.name === 'entrance')[0];        
                this.entrance = this.matter.add.image(
                    ConvertXCartesianToIsometric(entrance.x, entrance.y),
                    ConvertYCartesianToIsometric(entrance.x, entrance.y),
                    'boss',
                    'entrance.png'
                )
                this.entrance.setBody(colliders.closed)
                this.entrance.setDepth(this.entrance.y)
            } 
        }

        this.cursors = this.input.keyboard.createCursorKeys(); // Assigne les touches prédéfinis (flèches directionnelles, shift, alt, espace)
        this.pauseKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ESC); // Touche pour mettre le jeu en PAUSE

        this.matter.world.disableGravity();
        this.playerManager.colliders = colliders

        // --- AJOUTE LES ANIMATIONS  --- //
        CreatePurplePhantomAnims(this.anims, PURPLE);
        CreateGreenPhantomAnims(this.anims, GREEN);
        CreateRedPhantomAnims(this.anims, RED);
        CreatePlayerAnims(this.anims);

        /**@type {Phaser.Physics.Matter.Image} */
        let tempObject 
        map.createFromObjects('PlayerPoints', {}).forEach(
            /** @param {Phaser.Physics.Matter.Image} point */ 
            (point)=>{
            tempObject = this.matter.add.image(
                ConvertXCartesianToIsometric(point.x, point.y),
                ConvertYCartesianToIsometric(point.x, point.y),
                "playerPoints",
                point.name+".png"
            )
            tempObject.setBody(colliders[point.name+'-'+point.getData('orientation')])
            ChangeDepth(tempObject);
            if (point.getData('orientation') === 'left') {
                tempObject.setFlipX(true)
            }
            if (point.name === "SpawnPoint") {
                this.spawnPoint = tempObject
            } else if (point.name === "NextLevel") {
                this.playerManager.exitDoor = tempObject
            }}
        );
        
        this.objectLoader.AddMapColliders()
        this.objectLoader.AddObstacles()
        this.objectLoader.AddLayers()

        this.objectLoader.AddTheLevers()
        
        this.objectLoader.AddSafeZones()

        this.player = this.matter.add.sprite(
            this.spawnPoint.x, 
            this.spawnPoint.y, 
            'player', 
            'back-left-up 1.png'
        ).setFlipX(true).setScale(PLAYER_SIZE);
        this.player.setBody(colliders.player_top_right)
        this.player.setFixedRotation()
        ChangeDepth(this.player)
        this.player.setFixedRotation()
        
        this.objectLoader.AddEnemies(this.player, this.playerManager)
        
        this.cameras.main.startFollow(this.player, false, 0.05, 0.05); // Permet que la caméra suit le joueur
        
        this.UIManager.AddFilters();
        this.UIManager.AddBackGroundUI();
        this.UIManager.UpdateLife();
        this.UIManager.AddLeversUI();
        this.playerManager.CheckIfAllPressed(this.matter.world, this.player);

        this.collisionManager.CheckCollideWorld(this.boss, this.UIManager.leversStatus);
        this.collisionManager.CheckHitBoxes(this.playerManager, this.player, this.entrance, this.cameras.main);
        this.collisionManager.CheckButton(this.UIManager.leversStatus.length);

        // this.debugPlayerInfoText = this.add.text(0, 0, 'Character position: ').setScrollFactor(0); // to remove
    }

    update(t, dt) {
        if (!this.cursors || !this.player || !this.playerManager.canMove) {
            this.player.setVelocity(0);

            return
        }

        this.enemies.forEach(enemy => {
            ChangeDepth(enemy)
        });

        this.boxes.forEach(box => {
            ChangeDepth(box)
        })

        this.playerManager.CheckPlayerInputs(this.player, this.cursors);
        if (this.playerManager.canPress) {
            this.playerManager.UseButton(this.cursors, this.matter.world, this.player);
        }
        // this.UIManager.UpdatePlayerInfoText(this.debugPlayerInfoText, this.player, this.playerManager.canLoadNextScene, this.playerManager.isSafe);
    }
}