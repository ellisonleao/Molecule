(function (window) {

    var definedModules = [];
    var moleculeModules = [];
    var initializedModules = [];
    var isTest = false;
    var timeoutLimit = 100;
    var game = null;

    var p = {
        Module: function Module(name, func) {
            this.name = name;
            this.func = func;
        },
        isModule: function (module) {
            return module instanceof p.Module;
        },
        'throw': function (message) {
            throw Error('Molecule Error: ' + message);
        },
        getSinon: function () {
            return window.sinon;
        },
        getModule: function (name, modules) {
            var module;
            for (var x = 0; x < modules.length; x++) {
                if (modules[x].name === name) {
                    module = modules[x];
                    break;
                }
            }
            if (!module) p.throw('Could not require module: "' + name + '". The name does not exist or loading it causes a loop.');
            return module;
        },
        addModule: function (array, name, func) {
            array.push(new p.Module(name, func));
        },
        registerModules: function (defined, initialized) {
            var module,
                context,
                initializeModule = true,
                startTime = new Date().getTime(),
                depExceptions = [];
            while (defined.length && !p.timeout(startTime)) {
                initializeModule = true;
                module = p.getLast(defined);
                context = p.createContext(initialized);
                try {
                    context.exports = module.func.apply(context, p.contextToArray(context));
                } catch (e) {
                    // Dependency not ready
                    if (e.message.match(/Molecule Error/)) {
                        p.addDepException(depExceptions, e.message);
                        p.moveLastToFirst(defined);
                        initializeModule = false;
                    } else {
                        throw e;
                    }
                }
                if (initializeModule && typeof context.exports === 'undefined') {
                    p.throw('Module ' + module.name + ' is returning undefined, it has to return something');
                }
                if (initializeModule) {
                    module.exports = context.exports;
                    p.moveLastToTarget(defined, initialized);
                }
            }

            if (p.timeout(startTime)) {
                p.throw('Timeout, could not load modules. The following dependencies gave errors: ' +
                    (depExceptions.length ? depExceptions.join(', ') : '') +
                    '. They do not exist or has caused a loop.');
            }
        },
        contextToArray: function (context) {
            if (game) {
                return [game, context.require, context.privates];
            } else {
                return [context.require, context.privates];
            }

        },
        registerTestModule: function (name, defined) {
            var module,
                context,
                testModule,
                startTime = new Date().getTime(),
                depExceptions = [];
            while (!testModule && !p.timeout(startTime)) {
                module = p.getLast(defined);
                context = p.createTestContext(defined);
                if (module.name === name) {
                    try {
                        context.exports = module.func.apply(context, p.contextToArray(context));
                    } catch (e) {
                        if (e.message.match(/Molecule Error/)) {
                            p.addDepException(depExceptions, e.message);
                            p.moveLastToFirst(defined);
                        } else {
                            throw e;
                        }
                    }
                    testModule = module;
                } else {
                    p.moveLastToFirst(defined);
                }
            }
            if (p.timeout(startTime)) {
                p.throw('Timeout, could not load modules. The following dependencies gave errors: ' +
                    (depExceptions.length ? depExceptions.join(', ') : name) +
                    '. They do not exist or has caused a loop.');
            }

            if (!context.exports && !depExceptions.length) {
                p.throw('Module ' + testModule.name + ' is returning undefined, it has to return something');
            } else if (depExceptions.length) {
                p.throw('The following dependencies gave errors: ' + depExceptions.join(', ') +
                    '. They do not exist or has caused a loop.');
            }

            return context;

        },
        timeout: function (startTime) {
            return new Date().getTime() - startTime >= timeoutLimit;
        },
        addDepException: function (array, message) {
            message = message.match(/\"(.*)\"/)[1];
            if (array.indexOf(message) === -1) {
                array.push(message);
            }
        },
        createGame: function (width, height, scale) {
            var GameConstructor = p.getModule('Molecule.Game', initializedModules).exports;
            game = new GameConstructor(width, height, scale);
        },
        createContext: function (modules) {
            var context = {
                privates: {},
                require: function (name) {
                    var module = p.getModule(name, modules);
                    return p.isModule(module) ? module.exports : module; // Return exports only if it is a module-loader module
                },
                game: game
            }
            return context;
        },
        createTestContext: function (modules) {
            var context = {
                privates: {},
                deps: {}
            };
            context.require = p.createTestRequireMethod(context, modules);

            return context;
        },
        createTestRequireMethod: function (context, modules) {
            return function (name) {
                var depExceptions = [];
                var depModule = p.getModule(name, modules),
                    depContext = {
                        privates: {},
                        require: function (name) { // TODO: Make this more general with registerModule

                            var module = p.getModule(name, modules);

                            try {
                                module = module.func.apply(context, p.contextToArray(context));
                            } catch (e) {
                                if (e.message.match(/Molecule Error/)) {
                                    p.addDepException(depExceptions, e.message);
                                } else {
                                    throw e;
                                }
                            }

                            return p.isModule(module) ? module.exports : module; // Return exports only if it is a module-loader module

                        }
                    };

                depContext.exports = p.isModule(depModule) ? depModule.func.apply(depContext, p.contextToArray(depContext)) : depModule;

                // Adds the dependency exports to the main context
                // which lets you edit the stubs in the test
                depModule.exports = p.stubDepExports(depContext.exports);
                context.deps[name] = depModule.exports;

                return depModule.exports;
            }
        },
        stubDepExports: function (exports) {
            var sinon = p.getSinon();
            if (sinon) {
                var stubbedMethods = {};

                if (typeof exports === 'function') {
                    return sinon.spy();
                } else {
                    for (var depMethod in exports) {
                        if (typeof exports[depMethod] === 'function') {
                            stubbedMethods[depMethod] = exports[depMethod];
                            sinon.stub(stubbedMethods, depMethod);
                        }
                    }
                }

                return stubbedMethods;
            }
            return exports;
        },
        getLast: function (modules) {
            return modules[modules.length - 1];
        },
        moveLastToFirst: function (modules) {
            modules.unshift(modules.pop());
        },
        moveLastToTarget: function (sourceArray, targetArray) {
            targetArray.push(sourceArray.pop());
        },
        extractBrowserArgs: function (args) {
            return {
                name: args[0],
                func: args[1]
            }
        }
    };


    var Molecule = function (width, height, scale, callback) {

        var argsArray = Array.prototype.slice.call(arguments, 0),
            context;

        argsArray.forEach(function (arg) {
            if (typeof arg === 'function') {
                callback = arg;
            } else if (typeof arg === 'number' && width === undefined) {
                width = arg;
            } else if (typeof arg === 'number' && height === undefined) {
                height = arg;
            } else if (typeof arg === 'number' && scale === undefined) {
                scale = arg;
            }
        });

        p.registerModules(moleculeModules, initializedModules);
        p.createGame(width, height, scale);
        p.registerModules(definedModules, initializedModules);
        context = p.createContext(initializedModules);
        callback.call(context, context.game, context.require);

    };

    Molecule.module = function () {
        var args = p.extractBrowserArgs(arguments);
        if (!args.name || typeof args.name !== 'string' || !args.func || typeof args.func !== 'function') {
            p.throw('Invalid arguments for module creation, you have to pass a string and a function');
        }
        if (args.name.match(/Molecule/)) {
            p.addModule(moleculeModules, args.name, args.func);
        } else {
            p.addModule(definedModules, args.name, args.func);
        }

    };

    Molecule.test = function (name, callback) {
        isTest = true;
        var context = p.registerTestModule(name, definedModules);
        callback.apply(context, [context.exports, context.privates, context.deps]);
    };


    window.Molecule = Molecule;

}(window));
Molecule.module('Molecule.Animation', function (require, p) {

	function Animation() {
		this.frame = new Array();
		this.id = new Array();
		this.current = {animation: 0, frame: 0};
		this.timer = 0;
		this.loop = true;
		this.reverse = false;
		this.halt = false;
	};
	
	// Method to get frames of the sprite sheet
	Animation.prototype.sliceFrames = function(_imageWidth, _imageHeight, _frameWidth, _frameHeight) {
		for(var i = 0; i < _imageHeight - 1; i += _frameHeight) {
			for(var j = 0; j < _imageWidth - 1; j += _frameWidth) {
				this.frame.push({x:j, y:i});
			}
		}
		if(_imageWidth === _frameWidth && _imageHeight === _frameHeight) {
			this.add('', [0], 60);
		}
	};
	
	// Method to add an animation
	Animation.prototype.add = function(_name, _frames, _speed) {
	    var _speedFps = _speed * 60 / _frames.length;
		this.id.push({name: _name, frame: _frames, speed: _speedFps});
	};
	
	//Method to play current animation
	Animation.prototype.run = function(_name, _loop, _reverse) {
	    _loop = _loop === undefined ? true : _loop;
	    _reverse = _reverse === undefined ? false : _reverse;
		this.loop = _loop;
		this.reverse = _reverse;
		this.halt = false;
		if(this.current.animation === -1 || this.id[this.current.animation].name !== _name) {
			this.current.frame = -1;
			for(var i = 0; i < this.id.length; i++) {
				if(this.id[i].name === _name) {
					this.current.animation = i;
					this.current.frame = 0;
					this.timer = 0;
				}
			}
		}
	};
	
	Animation.prototype.stop = function() {
		this.halt = true;
	};
	
	// Method to get next animation frame
	Animation.prototype.nextFrame = function() {
		if(!this.halt) {
			this.timer++;
			if(this.timer > this.id[this.current.animation].speed) {
				this.timer = 0;
				if(!this.reverse) {
					this.current.frame++;
					if(this.current.frame >= this.id[this.current.animation].frame.length) {
						if(this.loop) {
							this.current.frame = 0;
						} else {
							this.current.frame = this.id[this.current.animation].frame.length - 1;
						}
					}
				} else {
					this.current.frame--;
					if(this.current.frame < 0) {
						if(this.loop) {
							this.current.frame = this.id[this.current.animation].frame.length - 1;
						} else {
							this.current.frame = 0;
						}
					}
				}
			}
		}
	};

	return Animation;

});
Molecule.module('Molecule.AudioFile', function (require, p) {

    var Sound = require('Molecule.Sound');

	function AudioFile(_game) {
		this.game = _game;
		this.name = new Array();
		this.data = new Array();
		this.counter = 0;
	};

	AudioFile.prototype.load = function(_audioSrc) {
		if(!this.getAudioDataByName(_audioSrc)) {
			var self = this;
			var _audio = new Audio();
			var _audioSrcFile;
			for(var i = 0; i < _audioSrc.length; i++) {
				var t = _audioSrc[i].split('.');
				if(_audio.canPlayType('audio/' + t[t.length - 1]) != '') {
					_audioSrcFile = _audioSrc[i];
				}
			}
			_audio.addEventListener('canplay', function(){self.counter++});
			_audio.src = _audioSrcFile;
			this.name.push(_audioSrc);
			this.data.push(_audio);
		}

		var s = new Sound();
		s.sound = this.getAudioDataByName(_audioSrc);
		this.game.sound.push(s);

		return s;
	};
	
	AudioFile.prototype.isLoaded = function() {
		if(this.counter === this.data.length) {
			return true;
		}
		return false;
	};

	AudioFile.prototype.getAudioDataByName = function(_audioName) {
		return this.data[this.name.indexOf(_audioName)];
	};

	return AudioFile;

});
Molecule.module('Molecule.Camera', function (require, p) {

    function Camera(_game) {
        this.game = _game;
        this.layer = null;
        this.sprite = null;
        this.scroll = {x: false, y: false};
        this.type = 0;
    };

	// Method for attach an sprite, map, and main layer
    Camera.prototype.attach = function (_sprite) {
        this.sprite = _sprite;
        this.type = 1;
        this.set();
    };

	// Method for detach an sprite
    Camera.prototype.detach = function () {
        this.sprite = null;
        this.type = 0;
    };

    Camera.prototype.set = function () {
        if (this.type === 1) {
            this.layer = this.game.map.getMainLayer();
            this.game.map.resetPosition();
            _x = this.sprite.position.x;
            this.sprite.position.x = 0;
            _y = this.sprite.position.y;
            this.sprite.position.y = 0;
            for (var i = 0; i < _x; i++) {
                this.sprite.move.x = 1;
                this.update(this.game.scene.sprites);
                this.game.cameraUpdate();
                this.game.resetMove();
            }

            for (var i = 0; i < _y; i++) {
                this.sprite.move.y = 1;
                this.update(this.game.scene.sprites);
                this.game.cameraUpdate();
                this.game.resetMove();
            }
        }
    };

	// Method for update the camera. It will update map & sprite
    Camera.prototype.update = function (_sprite) {
        if (this.game.map !== null && this.layer !== -1) {
            this.makeScroll();
            this.makeMapScroll();
        }
        this.makeSpriteScroll(_sprite, this.sprite.move.x, this.sprite.move.y);
    };

	// Method to check if scroll is necessary
    Camera.prototype.makeScroll = function () {
        this.scroll.x = false;
        this.scroll.y = false;
        var wx = this.game.map.canvas[this.layer].width;
        var wy = this.game.map.canvas[this.layer].height;
        if (this.game.map.json.layers[this.layer].properties.scroll.infinite.x) {
            wx = -this.game.map.json.layers[this.layer].x + this.game.canvas.width + 1;
        }
        if (this.game.map.json.layers[this.layer].properties.scroll.infinite.y) {
            wy = -this.game.map.json.layers[this.layer].y + this.game.canvas.height + 1;
        }
        if (this.game.map.json.layers[this.layer].properties.scrollable) {
            if ((-this.game.map.json.layers[this.layer].x + this.game.canvas.width < wx && this.sprite.move.x > 0 && this.sprite.position.x - this.sprite.anchor.x + this.sprite.scroll.offset.x + this.sprite.frame.width / 2 >= this.game.canvas.width / 2) || (-this.game.map.json.layers[this.layer].x > 0 && this.sprite.move.x < 0 && this.sprite.position.x - this.sprite.anchor.x + this.sprite.scroll.offset.x + this.sprite.frame.width / 2 <= this.game.canvas.width / 2)) {
                this.scroll.x = true;
            }
            if ((-this.game.map.json.layers[this.layer].y + this.game.canvas.height < wy && this.sprite.move.y > 0 && this.sprite.position.y - this.sprite.anchor.y + this.sprite.scroll.offset.y + this.sprite.frame.height / 2 >= this.game.canvas.height / 2) || (-this.game.map.json.layers[this.layer].y > 0 && this.sprite.move.y < 0 && this.sprite.position.y - this.sprite.anchor.y + this.sprite.scroll.offset.y + this.sprite.frame.height / 2 <= this.game.canvas.height / 2)) {
                this.scroll.y = true;
            }
        }
    };

	// Method to scroll map
    Camera.prototype.makeMapScroll = function () {
        for (var i = 0; i < this.game.map.json.layers.length; i++) {
            if (this.game.map.json.layers[i].type === 'tilelayer' && this.game.map.json.layers[i].properties.scrollable) {
                var wx = this.game.map.canvas[i].width;
                var wy = this.game.map.canvas[i].height;
                if (this.game.map.json.layers[i].properties.scroll.infinite.x) {
                    wx = -this.game.map.json.layers[i].x + this.game.canvas.width + 1;
                }
                if (this.game.map.json.layers[i].properties.scroll.infinite.y) {
                    wy = -this.game.map.json.layers[i].y + this.game.canvas.height + 1;
                }
                if ((-this.game.map.json.layers[i].x + this.game.canvas.width < wx && this.sprite.move.x > 0 && this.sprite.position.x - this.sprite.anchor.x + this.sprite.scroll.offset.x + this.sprite.frame.width / 2 >= this.game.canvas.width / 2) || (-this.game.map.json.layers[i].x > 0 && this.sprite.move.x < 0 && this.sprite.position.x - this.sprite.anchor.x + this.sprite.scroll.offset.x + this.sprite.frame.width / 2 <= this.game.canvas.width / 2)) {
                    if (this.scroll.x) {
                        if (i !== this.layer) {
                            this.game.map.json.layers[i].properties.scroll.x = this.sprite.move.x * -this.game.map.json.layers[i].properties.scroll.speed;
                        } else {
                            this.game.map.json.layers[i].properties.scroll.x = -this.sprite.move.x;
                        }

                    }
                }
                if ((-this.game.map.json.layers[i].y + this.game.canvas.height < wy && this.sprite.move.y > 0 && this.sprite.position.y - this.sprite.anchor.y + this.sprite.scroll.offset.y + this.sprite.frame.height / 2 >= this.game.canvas.height / 2) || (-this.game.map.json.layers[i].y > 0 && this.sprite.move.y < 0 && this.sprite.position.y - this.sprite.anchor.y + this.sprite.scroll.offset.y + this.sprite.frame.height / 2 <= this.game.canvas.height / 2)) {
                    if (this.scroll.y) {
                        if (i !== this.layer) {
                            this.game.map.json.layers[i].properties.scroll.y = this.sprite.move.y * -this.game.map.json.layers[i].properties.scroll.speed;
                        } else {
                            this.game.map.json.layers[i].properties.scroll.y = -this.sprite.move.y;
                        }
                    }
                }
            }
        }
    };

	// Method to scroll sprite
    Camera.prototype.makeSpriteScroll = function (_sprite, _x, _y) {
        for (var i = 0; i < _sprite.length; i++) {
            if (_sprite[i].scrollable) {
                if (this.scroll.x) {
                    _sprite[i].move.x = _sprite[i].move.x - _x;
                }
                if (this.scroll.y) {
                    _sprite[i].move.y = _sprite[i].move.y - _y;
                }
            }
        }
    };

    return Camera;

});
Molecule.module('Molecule.Game', function (require, p) {

    var MapFile = require('Molecule.MapFile'),
        Camera = require('Molecule.Camera'),
        Scene = require('Molecule.Scene'),
        Map = require('Molecule.Map'),
        ImageFile = require('Molecule.ImageFile'),
        AudioFile = require('Molecule.AudioFile'),
        Input = require('Molecule.Input'),
        Text = require('Molecule.Text'),
        physics = require('Molecule.Physics'),
        move = require('Molecule.Move'),
        calculateSpriteCollisions = require('Molecule.SpriteCollisions'),
        calculateMapCollisions = require('Molecule.MapCollisions');

	p.init = null;
	
    p.run = null;
    
    p.update = function (_exit, game) {
        var sprite;
        for (var i = 0; i < game.scene.sprites.length; i++) {
            sprite = game.scene.sprites[i];
            sprite.update();
            sprite.flipUpdate();
            if (sprite.animation !== null && _exit)
                sprite.animation.nextFrame();
        }
        if (game.map !== null)
            game.map.update();

    };

    p.loadResources = function (_interval, game) {
        if (game.sprite.isLoaded() && game.tilemap.isLoaded() && game.audio.isLoaded()) {
            clearInterval(_interval);
            for (var i = 0; i < game.scene.sprites.length; i++) {
                game.scene.sprites[i].getAnimation();
            }
            p.init();
            p.loop(game);
        }
    };

    p.removeSprites = function (sprites) {
        for (var i = sprites.length - 1; i >= 0; i--) {
            if (sprites[i].kill) {
                sprites.splice(i, 1);
            }
        }
    };

    p.resetCollisionState = function (sprites) {
        var sprite;
        for (var i = 0; i < sprites.length; i++) {
            sprite = sprites[i];
            sprite.collision.sprite.id = null;
            sprite.collision.sprite.left = false;
            sprite.collision.sprite.right = false;
            sprite.collision.sprite.up = false;
            sprite.collision.sprite.down = false;

            sprite.collision.map.tile = null;
            sprite.collision.map.left = false;
            sprite.collision.map.right = false;
            sprite.collision.map.up = false;
            sprite.collision.map.down = false;
        }
    };

    p.loop = function (game) {

        p.requestAnimFrame(function () {
            p.loop(game);
        });
        p.removeSprites(game.scene.sprites);
        p.update(null, game);
        if (game.status == 1) {
            var exit = false;
            physics(game);
            p.resetCollisionState(game.scene.sprites);
            while (!exit) {
                exit = move(game.scene.sprites);
                calculateMapCollisions(game);
                calculateSpriteCollisions(game);
                p.updateSpriteCollisionCheck(game.scene.sprites);
                if (game.camera.type === 1) {
                    game.camera.update(game.scene.sprites);
                }
                p.update(exit, game);
                p.checkBoundaries(game);
                game.resetMove();
            }
        }
        p.draw(game);
        p.run();
    };

    p.updateSpriteCollisionCheck = function (sprites) {
        var sprite;
        for (var i = 0; i < sprites.length; i++) {
            sprite = sprites[i];
            if (sprite.speed.check.x && sprite.speed.check.y) {
                sprite.resetMove();
            }
        }
    };

    p.checkBoundaries = function (game) {
        var sprite;
        for (var i = 0; i < game.scene.sprites.length; i++) {
            sprite = game.scene.sprites[i];
            if (game.boundaries.x !== null) {
                if (sprite.position.x - sprite.anchor.x < game.boundaries.x) {
                    sprite.position.x = game.boundaries.x + sprite.anchor.x;
                }
                if (sprite.position.x + sprite.frame.width - sprite.anchor.x > game.boundaries.x + game.boundaries.width) {
                    sprite.position.x = game.boundaries.x + game.boundaries.width - sprite.frame.width + sprite.anchor.x;
                }
            }
            if (game.boundaries.y !== null) {
                if (sprite.position.y - sprite.anchor.y < game.boundaries.y) {
                    sprite.position.y = game.boundaries.y + sprite.anchor.y;
                }
                if (sprite.position.y + sprite.frame.height - sprite.anchor.y > game.boundaries.y + game.boundaries.height) {
                    sprite.position.y = game.boundaries.y + game.boundaries.height - sprite.frame.height + sprite.anchor.y;
                }
            }
        }
    };

    p.draw = function (game) {
        game.context.clearRect(0, 0, game.canvas.width, game.canvas.height);
        if (game.map !== null && game.map.visible) {
            game.map.draw(false);
        }
        for (var i = 0; i < game.scene.sprites.length; i++) {
            if (game.scene.sprites[i].visible) {
                game.scene.sprites[i].draw(false);
            }
        }
        for (var i = 0; i < game.scene.sprites.length; i++) {
            if (game.scene.sprites[i].visible) {
                game.scene.sprites[i].draw(true);
            }
        }
        if (game.map !== null && game.map.visible) {
            game.map.draw(true);
        }
        for (var i = 0; i < game.scene.text.length; i++) {
            if (game.scene.text[i].visible) {
                game.scene.text[i].draw();
            }
        }
    };

    p.requestAnimFrame = (function () {
        var requestAnimFrame = window.requestAnimationFrame || window.webkitRequestAnimationFrame || window.mozRequestAnimationFrame || window.oRequestAnimationFrame || window.msRequestAnimationFrame || function (callback) {
            window.setTimeout(callback, 1000 / 60)
        };
        return requestAnimFrame.bind(window);
    })();

    p.start = function (game) {
        var interval = setInterval(function () {
            p.loadResources(interval, game);
        }, 100);
    };

    var Game = function (_width, _height, _scale) {
        this.canvas = null;
        this.context = null;
        this.scale = _scale || 1;
        this.physics = {gravity: {x: 0, y: 0}, friction: {x: 0, y: 0}};
        this.boundaries = {x: null, y: null, width: null, height: null};
        this.tilemap = new MapFile(this);
        this.camera = new Camera(this);
        this.scene = new Scene(this);
        this.map = new Map(this);
        this.next = {scene: null, fade: null};
        this.sprite = new ImageFile(this);
        this.audio = new AudioFile(this);
        this.sound = new Array();
        this.input = new Input(this);
        this.status = 1;
        this.timer = {loop: 60 / 1000, previus: null, now: null, fps: 60, frame: 0};
        this.width = _width;
        this.height = _height;

        this.canvas = document.createElement('canvas');
        this.canvas.setAttribute('id', 'canvas');

        this.canvas.width = _width;
        this.canvas.height = _height;

        this.canvas.style.width = _width * this.scale + "px";
        this.canvas.style.height = _height * this.scale + "px";
        this.context = this.canvas.getContext('2d');

        document.body.appendChild(this.canvas);
    };

    Game.prototype.init = function (callback) {
        p.start(this);
        callback();
    };

    Game.prototype.init = function (callback) {
        p.init = callback;
        p.start(this);
        delete this.init;
    };

    Game.prototype.update = function (callback) {
        p.run = callback;
    };

    Game.prototype.text = function (_font, _x, _y, _title) {
        var t = new Text(_font, _x, _y, _title, this);
        this.scene.text.push(t);
        return t;
    };

	// Not in use, remove?
    Game.prototype.updateTimer = function () {
        this.timer.frame++;
        this.timer.now = new Date().getTime();
        if (this.timer.previus !== null)
            this.timer.loop = (this.timer.now - this.timer.previus) / 1000;
        if (this.timer.now - this.timer.previus >= 1000) {
            this.timer.previus = this.timer.now;
            this.timer.fps = this.timer.frame;
            this.timer.frame = 0;
        }
    };

    Game.prototype.play = function () {
        this.status = 1;
    };

    Game.prototype.stop = function () {
        this.status = 0;
    };

    Game.prototype.resetMove = function () {

        for (var i = 0; i < this.scene.sprites.length; i++) {
            this.scene.sprites[i].resetMove();
        }
        if (this.map !== null) {
            this.map.resetScroll();
        }

        p.update(null, this);

    };

	Game.prototype.cameraUpdate = function(_exit) {
		for(var i = 0; i < this.scene.sprites.length; i++) {
			this.scene.sprites[i].update();
			this.scene.sprites[i].flipUpdate();
			if(this.scene.sprites[i].animation !== null && _exit)
				this.scene.sprites[i].animation.nextFrame();
		}
		if(this.map !== null)
			this.map.update();
	};

    Game.prototype.run = function () {
        console.log('running');
        p.run();
    };


//    Game.prototype.cancelRequestAnimFrame = (function () {
//        return window.cancelAnimationFrame || window.webkitCancelRequestAnimationFrame || window.mozCancelRequestAnimationFrame || window.oCancelRequestAnimationFrame || window.msCancelRequestAnimationFrame || clearTimeout
//    })();

    return Game;

});
Molecule.module('Molecule.ImageFile', function (require, p) {

    var Sprite = require('Molecule.Sprite');

	function ImageFile(_game) {
		this.game = _game;
		this.name = new Array();
		this.data = new Array();
		this.counter = 0;
	};

	ImageFile.prototype.preload = function(_imageSrc) {
		var _name = _imageSrc.substring(0, _imageSrc.length - 4);
		if(!this.getImageDataByName(_name)) {
			var self = this;
			var _image = new Image();
			_image.addEventListener('load', function(){self.counter++});
			_image.src = _imageSrc;
			this.name.push(_name);
			this.data.push(_image);
		}

		return this.getImageDataByName(_name);
	};

	ImageFile.prototype.load = function(_imageSrc, _width, _height) {
		var s = new Sprite(_imageSrc, _width, _height);
		s.game = this.game;
		s.image = this.preload(_imageSrc);
		if(this.isLoaded())
			s.getAnimation();
		this.game.scene.sprites.push(s);
		return s;
	};

	ImageFile.prototype.reset = function() {
		this.game.scene.sprites = [];
	};
	
	ImageFile.prototype.isLoaded = function() {
		if(this.counter === this.data.length) {
			return true;
		}
		return false;
	};

	ImageFile.prototype.getImageDataByName = function(_imageName) {
		return this.data[this.name.indexOf(_imageName)];
	};

	return ImageFile;

});
Molecule.module('Molecule.Input', function (require, p) {

	function Input(_game) {
		this.game = _game
		this.key = {SPACE: 0, LEFT_ARROW: 0, UP_ARROW: 0, RIGHT_ARROW: 0, DOWN_ARROW: 0, A: 0, B: 0, C: 0, D: 0, E: 0, F: 0, G: 0, H: 0, I: 0, J: 0, K: 0, L: 0, M: 0, N: 0, O: 0, P: 0, Q: 0, R: 0, S: 0, T: 0, U: 0, V: 0, W: 0, X: 0, Y: 0, Z: 0};
		this.mouse = {x: 0, y: 0, BUTTON_LEFT: 0, BUTTON_MIDDLE: 0, BUTTON_RIGHT: 0};
		this.touch = new Array();
	};

	// Method to init 'keyboard', 'mouse' or 'touch' depending of type
	Input.prototype.enable = function(_type) {
		var self = this;
		
		if(_type === 'keyboard') {
			document.addEventListener('keydown', function(_e){self.onkeydown(_e)}, true);
			document.addEventListener('keyup', function(_e){self.onkeyup(_e)}, true);
		}
		if(_type === 'mouse') {
			this.game.canvas.addEventListener('mousedown', function(_e){self.onmousedown(_e)}, true);
			this.game.canvas.addEventListener('mousemove', function(_e){self.onmousemove(_e)}, true);
			this.game.canvas.addEventListener('mouseup', function(_e){self.onmouseup(_e)}, true);
		}
		if(_type === 'touch') {
			this.game.canvas.addEventListener('MSPointerDown', function(_e){self.ontouchstart(_e)}, true);
			this.game.canvas.addEventListener('MSPointerMove', function(_e){self.ontouchmove(_e)}, true);
			this.game.canvas.addEventListener('MSPointerUp', function(_e){self.ontouchend(_e)}, true);
			this.game.canvas.addEventListener('MSPointerCancel', function(_e){self.ontouchcancel(_e)}, true);
	
			this.game.canvas.addEventListener('touchstart', function(_e){self.ontouchstart(_e)}, true);
			this.game.canvas.addEventListener('touchmove', function(_e){self.ontouchmove(_e)}, true);
			this.game.canvas.addEventListener('touchend', function(_e){self.ontouchend(_e)}, true);
			this.game.canvas.addEventListener('touchcancel', function(_e){self.ontouchcancel(_e)}, true);
		}
	};
	
	// Method to remove 'keyboard', 'mouse' or 'touch' depending of type
	Input.prototype.disable = function(_type) {
		var self = this;
	
		if(_type === 'keyboard') {
			document.removeEventListener('keydown', function(_e){self.onkeydown(_e)}, true);
			document.removeEventListener('keyup', function(_e){self.onkeyup(_e)}, true);
		}
		if(_type === 'mouse') {
			this.game.canvas.removeEventListener('mousedown', function(_e){self.onmousedown(_e)}, true);
			this.game.canvas.removeEventListener('mousemove', function(_e){self.onmousemove(_e)}, true);
			this.game.canvas.removeEventListener('mouseup', function(_e){self.onmouseup(_e)}, true);
		}
		if(_type === 'touch') {
			this.game.canvas.removeEventListener('MSPointerDown', function(_e){self.ontouchstart(_e)}, true);
			this.game.canvas.removeEventListener('MSPointerMove', function(_e){self.ontouchmove(_e)}, true);
			this.game.canvas.removeEventListener('MSPointerUp', function(_e){self.ontouchend(_e)}, true);
			this.game.canvas.removeEventListener('MSPointerCancel', function(_e){self.ontouchcancel(_e)}, true);
			
			this.game.canvas.removeEventListener('touchstart', function(_e){self.ontouchstart(_e)}, true);
			this.game.canvas.removeEventListener('touchmove', function(_e){self.ontouchmove(_e)}, true);
			this.game.canvas.removeEventListener('touchend', function(_e){self.ontouchend(_e)}, true);
			this.game.canvas.removeEventListener('touchcancel', function(_e){self.ontouchcancel(_e)}, true);
		}
	};
	
	// Method 'onkeydown' for 'keyboard' type
	Input.prototype.onkeydown = function(_e) {
		_e.preventDefault();
		switch(_e.keyCode) {
			case 32:
			this.key.SPACE = 1;
			break;
			case 37:
			this.key.LEFT_ARROW = 1;
			break;
			case 38:
			this.key.UP_ARROW = 1;
			break;
			case 39:
			this.key.RIGHT_ARROW = 1;
			break;
			case 40:
			this.key.DOWN_ARROW = 1;
			break;
			case 65:
			this.key.A = 1;
			break;
			case 66:
			this.key.B = 1;
			break;
			case 67:
			this.key.C = 1;
			break;
			case 68:
			this.key.D = 1;
			break;
			case 69:
			this.key.E = 1;
			break;
			case 70:
			this.key.F = 1;
			break;
			case 71:
			this.key.G = 1;
			break;
			case 72:
			this.key.H = 1;
			break;
			case 73:
			this.key.I = 1;
			break;
			case 74:
			this.key.J = 1;
			break;
			case 75:
			this.key.K = 1;
			break;
			case 76:
			this.key.L = 1;
			break;
			case 77:
			this.key.M = 1;
			break;
			case 78:
			this.key.N = 1;
			break;
			case 79:
			this.key.O = 1;
			break;
			case 80:
			this.key.P = 1;
			break;
			case 81:
			this.key.Q = 1;
			break;
			case 82:
			this.key.R = 1;
			break;
			case 83:
			this.key.S = 1;
			break;
			case 84:
			this.key.T = 1;
			break;
			case 85:
			this.key.U = 1;
			break;
			case 86:
			this.key.V = 1;
			break;
			case 87:
			this.key.W = 1;
			break;
			case 88:
			this.key.X = 1;
			break;
			case 89:
			this.key.Y = 1;
			break;
			case 90:
			this.key.Z = 1;
			break;
		}
	};
	
	// Method 'onkeyup' for 'keyboard' type
	Input.prototype.onkeyup = function(_e) {
		_e.preventDefault();
		switch(_e.keyCode) {
			case 32:
			this.key.SPACE = 0;
			break;
			case 37:
			this.key.LEFT_ARROW = 0;
			break;
			case 38:
			this.key.UP_ARROW = 0;
			break;
			case 39:
			this.key.RIGHT_ARROW = 0;
			break;
			case 40:
			this.key.DOWN_ARROW = 0;
			break;
			case 65:
			this.key.A = 0;
			break;
			case 66:
			this.key.B = 0;
			break;
			case 67:
			this.key.C = 0;
			break;
			case 68:
			this.key.D = 0;
			break;
			case 69:
			this.key.E = 0;
			break;
			case 70:
			this.key.F = 0;
			break;
			case 71:
			this.key.G = 0;
			break;
			case 72:
			this.key.H = 0;
			break;
			case 73:
			this.key.I = 0;
			break;
			case 74:
			this.key.J = 0;
			break;
			case 75:
			this.key.K = 0;
			break;
			case 76:
			this.key.L = 0;
			break;
			case 77:
			this.key.M = 0;
			break;
			case 78:
			this.key.N = 0;
			break;
			case 79:
			this.key.O = 0;
			break;
			case 80:
			this.key.P = 0;
			break;
			case 81:
			this.key.Q = 0;
			break;
			case 82:
			this.key.R = 0;
			break;
			case 83:
			this.key.S = 0;
			break;
			case 84:
			this.key.T = 0;
			break;
			case 85:
			this.key.U = 0;
			break;
			case 86:
			this.key.V = 0;
			break;
			case 87:
			this.key.W = 0;
			break;
			case 88:
			this.key.X = 0;
			break;
			case 89:
			this.key.Y = 0;
			break;
			case 90:
			this.key.Z = 0;
			break;
		}
	};
	
	// Method 'onmousedown' for 'mouse' type
	Input.prototype.onmousedown = function(_e) {
		switch(_e.button) {
			case 0:
			this.mouse.BUTTON_LEFT = 1;
			break;
			case 1:
			this.mouse.BUTTON_MIDDLE = 1;
			break;
			case 2:
			this.mouse.BUTTON_RIGHT = 1;
			break;
		}
		this.mousePosition(_e);
	};
	
	// Method 'onmousemove' for 'mouse' type
	Input.prototype.onmousemove = function(_e) {
		this.mousePosition(_e);
	};
	
	// Method 'onmouseup' for 'mouse' type
	Input.prototype.onmouseup = function(_e) {
		switch(_e.button) {
			case 0:
			this.mouse.BUTTON_LEFT = 0;
			break;
			case 1:
			this.mouse.BUTTON_MIDDLE = 0;
			break;
			case 2:
			this.mouse.BUTTON_RIGHT = 0;
			break;
		}
		this.mousePosition(_e);
	};
	
	Input.prototype.mousePosition = function(_e) {
		this.mouse.x = (_e.pageX  - this.game.canvas.offsetLeft) / this.game.scale;
		this.mouse.y = (_e.pageY - this.game.canvas.offsetTop) / this.game.scale;
	}
	
	// Method 'ontouchstart' for 'touch' type
	Input.prototype.ontouchstart = function(_e) {
		_e.preventDefault();
		this.normalizeTouches(_e);
	};
	
	// Method 'ontouchmove' for 'touch' type
	Input.prototype.ontouchmove = function(_e) {
		_e.preventDefault();
		this.normalizeTouches(_e);
	};
	
	// Method 'ontouchend' for 'touch' type
	Input.prototype.ontouchend = function(_e) {
		_e.preventDefault();
		this.normalizeTouches(_e);
	};
	
	// Method 'ontouchcancel' for 'touch' type
	Input.prototype.ontouchcancel = function(_e) {
		_e.preventDefault();
		this.touch = [];
	};
	
	// Method to normalize touches depending of canvas size and position
	Input.prototype.normalizeTouches = function(_e) {
		this.touch = [];
		if(_e.touches) {
			for(var i = 0; i < _e.touches.length; i++) {
				this.touch.push({x: (_e.touches[i].pageX - this.game.canvas.offsetLeft) / this.game.scale, y: (_e.touches[i].pageY - this.game.canvas.offsetTop) / this.game.scale});
			}
		} else {
			if(_e !== undefined) {
				this.touch.push({x: (_e.pageX - this.game.canvas.offsetLeft) / this.game.scale, y: (_e.pageY - this.game.canvas.offsetTop) / this.game.scale});
			}
		}
	};
	
	return Input;

});
Molecule.module('Molecule.Map', function (require, p) {

	function Map(_game) {
		this.game = _game;
		this.canvas = [];
		this.context = [];
		this.name = null;
		this.visible = true;
		this.image = [];
		this.path = '';
		this.response = null;
		this.json = null;
		this.loaded = false;
	};

	Map.prototype.load = function(_name) {
		this.name = _name;
		var t = _name.split('/');
		for(var i = 0; i < t.length - 1; i++) {
			this.path += t[i] + '/';
		}
		this.ajaxJsonReq(this.name);
	};

	Map.prototype.ajaxJsonReq = function(_name) {
		var self = this;
		var ajaxReq = new XMLHttpRequest();
		ajaxReq.open("GET", _name, true);
		ajaxReq.setRequestHeader("Content-type", "application/json");
		ajaxReq.addEventListener('readystatechange', function(){self.jsonLoaded(ajaxReq)});
		ajaxReq.send();
	};

	Map.prototype.jsonLoaded = function(_ajaxReq) {
		if(_ajaxReq.readyState == 4 && _ajaxReq.status == 200) {
			this.response = _ajaxReq.responseText;
			this.json = JSON.parse(this.response);
			this.addProperties();
			this.loadImages();
		}
	};

	Map.prototype.reset = function() {
		this.json = null;
		this.json = JSON.parse(this.response);
		this.addProperties();
		this.canvas = [];
		this.context = [];
		this.createContext();
	};

	Map.prototype.loadImages = function() {
		var self = this;
		for(var i = 0; i < this.json.tilesets.length; i++) {
			var image = this.game.sprite.preload(this.path + this.json.tilesets[i].image);
			this.image.push(image);
		}
		var interval = setInterval(function(){self.loadResources(interval)}, 100);
	};

	Map.prototype.loadResources = function(_interval) {
		if(this.game.sprite.isLoaded()) {
			clearInterval(_interval);
			this.createContext();
			this.loaded = true;
		}
	};

	Map.prototype.addProperties = function() {
		for(var i = 0; i < this.json.layers.length; i++) {
			if(this.json.layers[i].type === 'tilelayer') {
				if(this.json.layers[i].properties !== undefined) {
					var main = this.json.layers[i].properties['main'] === 'true'? true : false || false;
					var scrollable = this.json.layers[i].properties['scrollable'] === 'false'? false : true || true;
					var collidable = this.json.layers[i].properties['collidable'] === 'true'? true : false || false;
					var overlap = this.json.layers[i].properties['overlap'] === 'true'? true : false || false;
					var speed = parseFloat(this.json.layers[i].properties['scroll.speed']).toFixed(3) || 1;
					var infiniteX = this.json.layers[i].properties['scroll.infinite.x'] === 'true'? true : false || false;
					var infiniteY = this.json.layers[i].properties['scroll.infinite.y'] === 'true'? true : false || false;
					this.json.layers[i].properties = {scroll: {x: 0, y: 0, speed: speed, infinite: {x: infiniteX, y: infiniteY}}, main: main, scrollable: scrollable, collidable: collidable, overlap: overlap, infinite: {x: infiniteX, y: infiniteY}};
				} else {
					this.json.layers[i]['properties'] = {scroll: {x: 0, y: 0, speed: 1, infinite: {x: false, y: false}}, main: false, scrollable: true, collidable: false, overlap: false, infinite: {x: false, y: false}};
				}
			}
		}
	};

	Map.prototype.createContext = function() {
		for(var i = 0; i < this.json.layers.length; i++) {
			if(this.json.layers[i].type === 'tilelayer') {
				this.canvas.push(document.createElement('canvas'));
				this.context.push(this.canvas[i].getContext('2d'));
				this.canvas[i].width = (this.json.layers[i].width * this.json.tilewidth);
				this.canvas[i].height = (this.json.layers[i].height * this.json.tileheight);
				for(j = 0; j < this.json.layers[i].data.length; j++) {
					var data = this.json.layers[i].data[j];
					if(data > 0) {
						var tileset = this.getTileset(data);
						this.context[i].save();
						this.context[i].globalAlpha = this.json.layers[i].opacity;
						this.context[i].drawImage(this.image[tileset], Math.floor((data - this.json.tilesets[tileset].firstgid) % (this.json.tilesets[tileset].imagewidth / this.json.tilesets[tileset].tilewidth)) * this.json.tilesets[tileset].tilewidth, Math.floor((data - this.json.tilesets[tileset].firstgid) / (this.json.tilesets[tileset].imagewidth / this.json.tilesets[tileset].tilewidth)) * this.json.tilesets[tileset].tilewidth, this.json.tilesets[tileset].tilewidth, this.json.tilesets[tileset].tileheight, (Math.floor(j % this.json.layers[i].width) * this.json.tilewidth), (Math.floor(j / this.json.layers[i].width) * this.json.tilewidth), this.json.tilewidth, this.json.tileheight);
						this.context[i].restore();
					}
				}
			}
		}
	};

	Map.prototype.getTileset = function(_data) {
		for(var i = 0; i < this.json.tilesets.length; i++) {
			if(this.json.tilesets.length === 1 || this.json.tilesets.length === i || this.json.tilesets[i].firstgid === _data) {
				return i;
			} else if(this.json.tilesets[i].firstgid > _data) {
				return i - 1;
			}
		}
	};

	Map.prototype.getMainLayer = function() {
		if(this.json !== null) {
			for(var i = 0; i < this.json.layers.length; i++) {
				if(this.game.map.json.layers[i].type === 'tilelayer' && this.json.layers[i].properties.main) {
					return i;
				}
			}
		}
		return -1;
	};

	Map.prototype.getLayerIdByName = function(_name) {
		for(var i = 0; i < this.json.layers.length; i++) {
			if(this.json.layers[i].name === _name) {
				return i;
			}
		}
		return -1;
	};

	Map.prototype.getTilesetIdByName = function(_name) {
		for(var i = 0; i < this.json.tilesets.length; i++) {
			if(this.json.tilesets[i].name === _name) {
				return i;
			}
		}
		return -1;
	};

	Map.prototype.getTile = function(_name, _x, _y, _width, _height) {
		_width = _width || 0;
		_height = _height || 0;
		var layer = this.getLayerIdByName(_name);
		if(this.json.layers[layer].type === 'tilelayer') {
			if(this.json.layers[layer].properties.scroll.infinite.x && _x >= this.canvas[layer].width / 2) {
				_x = Math.floor(_x % this.canvas[layer].width);
			}
			if(this.json.layers[layer].properties.scroll.infinite.y && _y >= this.canvas[layer].height / 2) {
				_y = Math.floor(_y % this.canvas[layer].height);
			}
			var tile = (Math.floor(_y / this.json.tileheight) * this.json.layers[layer].width) + Math.floor(_x / this.json.tilewidth);
			if((tile >= this.json.layers[layer].data.length || tile < 0) || (_x > this.json.layers[layer].width * this.json.tilewidth || _x + _width < 0) || (_y > this.json.layers[layer].height * this.json.tileheight || _y + _height < 0)) {
				return null;
			} else {
				return tile;
			}
		} else {
			return null;
		}
	};

	Map.prototype.getTileData = function(_name, _x, _y) {
		var layer = this.getLayerIdByName(_name);
		var tile = this.getTile(_name, _x, _y);
		if(tile === null) {
			return null;
		} else {
			return this.json.layers[layer].data[tile];	
		}
	};

	Map.prototype.clearTile = function(_name, _x, _y) {
		var id = this.getLayerIdByName(_name);
		var layer = this.json.layers[id];
		var tile = this.getTile(_name, _x, _y);
		if(tile !== null) {
			layer.data[tile] = 0;
			this.context[id].save();
			this.context[id].globalAlpha = layer.opacity;
			this.context[id].clearRect(Math.floor(tile % this.json.layers[id].width) * this.json.tilewidth, Math.floor(tile / this.json.layers[id].width) * this.json.tilewidth, this.json.tilewidth, this.json.tileheight);
			this.context[id].restore();
		}
	};

	Map.prototype.setTile = function(_name, _x, _y, _tileset, _tile) {
		var id = this.getLayerIdByName(_name);
		var layer = this.json.layers[id];
		var tile = this.getTile(_name, _x, _y);
		var tileset = this.getTilesetIdByName(_tileset);
		var data = _tile + this.json.tilesets[tileset].firstgid;
		if(tile !== null) {
			layer.data[tile] = data;
			this.context[id].save();
			this.context[id].globalAlpha = this.json.layers[id].opacity;
			this.context[id].drawImage(this.image[tileset], Math.floor((data - this.json.tilesets[tileset].firstgid) % this.json.layers[id].width) * this.json.tilesets[tileset].tilewidth, Math.floor((data - this.json.tilesets[tileset].firstgid) / this.json.layers[id].width) * this.json.tilesets[tileset].tilewidth, this.json.tilesets[tileset].tilewidth, this.json.tilesets[tileset].tileheight, Math.floor(tile % this.json.layers[id].width) * this.json.tilewidth, Math.floor(tile / this.json.layers[id].width) * this.json.tilewidth, this.json.tilewidth, this.json.tileheight);
			this.context[id].restore();
		}
	};

	Map.prototype.update = function() {
		if(this.json !== null) {
			for(var i = 0; i < this.json.layers.length; i++) {
				if(this.json.layers[i].type === 'tilelayer') {
					this.json.layers[i].x += this.json.layers[i].properties.scroll.x;
					this.json.layers[i].y += this.json.layers[i].properties.scroll.y;
					this.json.layers[i].x = parseFloat(this.json.layers[i].x.toFixed(3));
					this.json.layers[i].y = parseFloat(this.json.layers[i].y.toFixed(3));

					if(this.json.layers[i].properties.scroll.infinite.x && Math.round(this.json.layers[i].x) <= -this.canvas[i].width && this.json.layers[i].properties.scroll.x < 0) {
						this.json.layers[i].x = 0;
					} else if(this.json.layers[i].properties.scroll.infinite.x && Math.round(this.json.layers[i].x) >= 0 && this.json.layers[i].properties.scroll.x > 0) {
						this.json.layers[i].x = -this.canvas[i].width + 1;
					}
					if(this.json.layers[i].properties.scroll.infinite.y && Math.round(this.json.layers[i].y) <= -this.canvas[i].height && this.json.layers[i].properties.scroll.y < 0) {
						this.json.layers[i].y = 0;
					} else if(this.json.layers[i].properties.scroll.infinite.y && Math.round(this.json.layers[i].y) >= 0 && this.json.layers[i].properties.scroll.y > 0) {
						this.json.layers[i].y = -this.canvas[i].height + 1;
					}
					
				}
			}
		}
	};

	Map.prototype.resetScroll = function() {
		if(this.json !== null) {
			for(var i = 0; i < this.json.layers.length; i++) {
				if(this.json.layers[i].type === 'tilelayer') {
					this.json.layers[i].properties.scroll.x = 0;
					this.json.layers[i].properties.scroll.y = 0;
				}
			}
		}
	};

	Map.prototype.resetPosition = function() {
		for(var i = 0; i < this.json.layers.length; i++) {
			if(this.json.layers[i].type === 'tilelayer') {
				this.json.layers[i].x = 0;
				this.json.layers[i].y = 0;
			}
		}
	};

	Map.prototype.draw = function(_overlap) {
		for(var i = 0; i < this.canvas.length; i++) {
			if(this.json.layers[i].type === 'tilelayer' && this.json.layers[i].visible && this.json.layers[i].properties.overlap === _overlap) {
				var w = this.game.canvas.width > this.canvas[i].width ? this.canvas[i].width : this.game.canvas.width;
				var h = this.game.canvas.height > this.canvas[i].height ? this.canvas[i].height : this.game.canvas.height;
				var w1x = 0;
				var w1y = 0;
				if(this.json.layers[i].properties.scroll.infinite.x && Math.floor(-this.json.layers[i].x) + w > this.canvas[i].width) {
					w1x = Math.floor(-this.json.layers[i].x) + w - this.canvas[i].width;
				}
				if(this.json.layers[i].properties.scroll.infinite.y && Math.floor(-this.json.layers[i].y) + h > this.canvas[i].height) {
					w1y = Math.floor(-this.json.layers[i].y) + h - this.canvas[i].height;
				}
				this.game.context.save();
				this.game.context.drawImage(this.canvas[i], Math.floor(-this.json.layers[i].x), Math.floor(-this.json.layers[i].y), w - w1x, h - w1y, 0, 0, w - w1x, h - w1y);
				this.game.context.restore();
				if(this.json.layers[i].properties.scroll.infinite.x) {
					if(w1x > 0) {
						this.game.context.save();
						this.game.context.drawImage(this.canvas[i], 0, 0, w1x, h, w - w1x, 0, w1x, h);
						this.game.context.restore();	
					}
				}
				if(this.json.layers[i].properties.scroll.infinite.y) {
					if(w1y > 0) {
						this.game.context.save();
						this.game.context.drawImage(this.canvas[i], 0, 0, w, w1y, 0, h - w1y, w, w1y);
						this.game.context.restore();	
					}
				}
				if(this.json.layers[i].properties.scroll.infinite.x && this.json.layers[i].properties.scroll.infinite.y) {
					if(w1x > 0 && w1y > 0) {
						this.game.context.save();
						this.game.context.drawImage(this.canvas[i], 0, 0, w1x, w1y, w - w1x, h - w1y, w1x, w1y);
						this.game.context.restore();	
					}
				} 
			}
		}
	};

	return Map;

});
Molecule.module('Molecule.MapCollisions', function (require, p) {

    p.spriteCollidesWithLayer = function (layer, sprite) {
        return layer.type === 'tilelayer' && layer.properties.collidable && sprite.collides.map;
    };

    p.getHeight = function (tileHeight, sprite) {
        return Math.ceil((sprite.frame.height - sprite.frame.offset.height) / tileHeight);
    };

    p.getWidth = function (tileWidth, sprite) {
        return Math.ceil((sprite.frame.width - sprite.frame.offset.width) / tileWidth);
    };

    p.getPosX = function (layer, sprite, tileWidth) {
        return sprite.position.x - sprite.anchor.x + sprite.move.x + Math.abs(layer.x) + tileWidth;
    };

    p.getPosY = function (layer, sprite, tileHeight) {
        return sprite.position.y - sprite.anchor.y + sprite.move.y + Math.abs(layer.y) + tileHeight;
    };

    p.updateCollisionX = function (layer, sprite, tile, j, physics) {
        if (sprite.collidesWithTile(layer, tile, j)) {
            if (sprite.move.y > 0) {
                sprite.collision.map.down = true;
                sprite.collision.map.tile = tile;
            }
            if (sprite.move.y < 0) {
                sprite.collision.map.up = true;
                sprite.collision.map.tile = tile;
            }
            if (sprite.collision.map.down && physics.gravity.y > 0) {
                sprite.speed.gravity.y = 0;
            }
            if (sprite.collision.map.up && physics.gravity.y < 0) {
                sprite.speed.gravity.y = 0;
            }
            if ((sprite.collision.check.map.up && sprite.collision.map.up) || (sprite.collision.check.map.down && sprite.collision.map.down)) {
                sprite.move.y = 0;
                sprite.speed.y = 0;
                sprite.speed.t.y = 0;
            }
        }
    };

    p.updateCollisionY = function (layer, sprite, tile, j, physics) {

        if (sprite.collidesWithTile(layer, tile, j)) {
            if (sprite.move.x > 0) {
                sprite.collision.map.right = true;
                sprite.collision.map.tile = tile;
            }
            if (sprite.move.x < 0) {
                sprite.collision.map.left = true;
                sprite.collision.map.tile = tile;
            }
            if (sprite.collision.map.left && physics.gravity.x < 0) {
                sprite.speed.gravity.x = 0;
            }
            if (sprite.collision.map.right && physics.gravity.x > 0) {
                sprite.speed.gravity.x = 0;
            }
            if ((!sprite.collision.check.map.up && sprite.collision.map.up) || (!sprite.collision.check.map.down && sprite.collision.map.down)) {
            } else {
                if ((sprite.collision.check.map.left && sprite.collision.map.left) || (sprite.collision.check.map.right && sprite.collision.map.right)) {
                    sprite.move.x = 0;
                    sprite.speed.x = 0;
                    sprite.speed.t.x = 0;
                }
            }
        }
    };

    return function (game) {
        var map = game.map,
            sprites = game.scene.sprites,
            i,
            j,
            k,
            l,
            sprite,
            layer,
            mc,
            tile,
            tx,
            ty;

        if (!map || !map.json) {
            return;
        }

        for (i = 0; i < sprites.length; i++) {
            sprite = sprites[i];
            for (j = 0; j < map.json.layers.length; j++) {
                layer = map.json.layers[j];
                if (p.spriteCollidesWithLayer(layer, sprite)) {
                    mc = 0;
                    while (mc <= 2) {
                        if (sprite.move.x !== 0 || sprite.move.y !== 0) {
                            for (k = 0; k <= p.getHeight(map.json.tileheight, sprite); k++) {
                                for (l = 0; l <= p.getWidth(map.json.tilewidth, sprite); l++) {
                                    tile = map.getTile(layer.name, p.getPosX(layer, sprite, l * map.json.tilewidth), p.getPosY(layer, sprite, k * map.json.tileheight), sprite.frame.width, sprite.frame.height);
                                    if (tile !== null && layer.data[tile % layer.data.length] > 0 && sprite.collidesWithTile(layer, tile, j)) {
                                        if (mc === 0 || mc === 2) {
                                            tx = sprite.move.x;
                                            sprite.move.x = 0;
                                            p.updateCollisionX(layer, sprite, tile, j, game.physics);
                                            sprite.move.x = tx;
                                        }
                                        if (mc === 1 || mc === 2) {
                                            ty = sprite.move.y;
                                            if (mc !== 2)
                                                sprite.move.y = 0;
                                            p.updateCollisionY(layer, sprite, tile, j, game.physics);
                                            sprite.move.y = ty;
                                        }
                                    }
                                }
                            }
                        }
                        mc++;
                    }
                }
            }
        }
    }
});
Molecule.module('Molecule.MapFile', function (require, p) {

    var Tile = require('Molecule.Tile'),
        Map = require('Molecule.Map');

	function MapFile(_game) {
		this.game = _game;
		this.tile = new Tile(_game);
		this.map = [];
	};

	MapFile.prototype.load = function(_name) {
		var m = new Map(this.game);
		m.load(_name);
		this.map.push(m);
		return m;
	};

	MapFile.prototype.isLoaded = function() {
		var loaded = true;
		for(var i = 0; i < this.map.length; i++) {
			if(!this.map[i].loaded) {
				loaded = false;
			}
		}
		return loaded;
	};

	MapFile.prototype.set = function(_map, _reset) {
		_reset = _reset || false;
		this.game.camera.detach();
		if(_reset)
			_map.reset();
		this.game.map = _map;
	};

	MapFile.prototype.sprite = function(_name) {
		for(var i = 0; i < this.game.map.json.layers.length; i++) {
			if(this.game.map.json.layers[i].type === 'objectgroup') {
				for(var j = 0; j < this.game.map.json.layers[i].objects.length; j++) {
					if(this.game.map.json.layers[i].objects[j].name === _name) {
						var _tileset = this.game.map.getTileset(this.game.map.json.layers[i].objects[j].gid);
						var _sprite = this.game.sprite.load(this.game.map.path + this.game.map.json.tilesets[this.game.map.getTilesetIdByName(_name)].image, this.game.map.json.tilesets[_tileset].tilewidth, this.game.map.json.tilesets[_tileset].tileheight);
						_sprite.name = this.game.map.json.layers[i].objects[j].name;
						_sprite.position.x = parseInt(this.game.map.json.layers[i].objects[j].x);
						_sprite.position.y = parseInt(this.game.map.json.layers[i].objects[j].y) - _sprite.frame.height;
						_sprite.visible = this.game.map.json.layers[i].objects[j].visible;
						_sprite.anchor.x = parseInt(this.game.map.json.layers[i].objects[j].properties['anchor.x']) || _sprite.anchor.x;
						_sprite.anchor.y = parseInt(this.game.map.json.layers[i].objects[j].properties['anchor.y']) || _sprite.anchor.y;
						_sprite.flip.x = parseInt(this.game.map.json.layers[i].objects[j].properties['flip.x']) || _sprite.flip.x;
						_sprite.flip.y = parseInt(this.game.map.json.layers[i].objects[j].properties['flip.y']) || _sprite.flip.y;
						_sprite.frame.width = parseInt(this.game.map.json.layers[i].objects[j].properties['frame.width']) || _sprite.frame.width;
						_sprite.frame.height = parseInt(this.game.map.json.layers[i].objects[j].properties['frame.height']) || _sprite.frame.height;
						_sprite.frame.offset.width = parseInt(this.game.map.json.layers[i].objects[j].properties['frame.offset.width']) || _sprite.frame.offset.width;
						_sprite.frame.offset.height = parseInt(this.game.map.json.layers[i].objects[j].properties['frame.offset.heigh']) || _sprite.frame.offset.height;
						_sprite.collides.sprite = this.game.map.json.layers[i].objects[j].properties['collides.sprite'] === 'false' ? false : true || true;
						_sprite.collides.map = this.game.map.json.layers[i].objects[j].properties['collides.map'] === 'false' ? false : true || true;
						_sprite.scrollable = this.game.map.json.layers[i].objects[j].properties['scrollable'] === 'false' ? false : true || true;
						_sprite.collidable = this.game.map.json.layers[i].objects[j].properties['collidable'] === 'false' ? false : true || true;
						_sprite.speed.min.x = parseFloat(this.game.map.json.layers[i].objects[j].properties['speed.min.x']).toFixed(3) || _sprite.speed.min.x;
						_sprite.speed.min.y = parseFloat(this.game.map.json.layers[i].objects[j].properties['speed.min.y']).toFixed(3) || _sprite.speed.min.y;
						_sprite.speed.max.x = parseFloat(this.game.map.json.layers[i].objects[j].properties['speed.max.x']).toFixed(3) || _sprite.speed.max.x;
						_sprite.speed.max.y = parseFloat(this.game.map.json.layers[i].objects[j].properties['speed.max.y']).toFixed(3) || _sprite.speed.max.y;
						_sprite.affects.physics.gravity = this.game.map.json.layers[i].objects[j].properties['affects.physics.gravity'] === 'false' ? false : true || true;
						_sprite.affects.physics.friction = this.game.map.json.layers[i].objects[j].properties['affects.physics.friction'] === 'false' ? false : true || true;
						_sprite.bounciness = this.game.map.json.layers[i].objects[j].properties['bounciness'] === 'true' ? true : false || false;
						return _sprite;
					}
				}
			}
		}
	};

	return MapFile;

});
Molecule.module('Molecule.Move', function (require, p) {

   return function (sprites) {
       var r = true,
           t,
           sprite;

       for (var i = 0; i < sprites.length; i++) {
           sprite = sprites[i];
           t = true;
           sprite.speed.check.x = true;
           sprite.speed.check.y = true;
           if (sprite.speed.t.x >= 1) {
               sprite.speed.t.x -= 1;
               sprite.move.x = 1;
               t = false;
               r = false;
               sprite.speed.check.x = false;
           } else if (sprite.speed.t.x <= -1) {
               sprite.speed.t.x += 1;
               sprite.move.x = -1;
               t = false;
               r = false;
               sprite.speed.check.x = false;
           }
           if (sprite.speed.t.y >= 1) {
               sprite.speed.t.y -= 1;
               sprite.move.y = 1;
               t = false;
               r = false;
               sprite.speed.check.y = false;
           } else if (sprite.speed.t.y <= -1) {
               sprite.speed.t.y += 1;
               sprite.move.y = -1;
               t = false;
               r = false;
               sprite.speed.check.y = false;
           }
           if (t) {
               if (sprite.speed.t.x !== 0)
                   sprite.speed.t.x > 0 ? sprite.move.x = 1 : sprite.move.x = -1;
               if (sprite.speed.t.y !== 0)
                   sprite.speed.t.y > 0 ? sprite.move.y = 1 : sprite.move.y = -1;
           }
       }
       return r;

   }

});
Molecule.module('Molecule.Physics', function (require, p) {

    p.addFriction = function (sprite, game) {
        if (sprite.speed.x > 0) {
            sprite.speed.x = sprite.speed.x * (1 - game.physics.friction.x);
            if (sprite.speed.x < 0.05) {
                sprite.speed.x = 0;
            }
        } else if (sprite.speed.x < 0) {
            sprite.speed.x = sprite.speed.x * (1 - game.physics.friction.x);
            if (sprite.speed.x > 0.05) {
                sprite.speed.x = 0;
            }
        }
        if (sprite.speed.y > 0) {
            sprite.speed.y = sprite.speed.y * (1 - game.physics.friction.y);
            if (sprite.speed.y < 0.05) {
                sprite.speed.y = 0;
            }
        } else if (sprite.speed.y < 0) {
            sprite.speed.y = sprite.speed.y * (1 - game.physics.friction.y);
            if (sprite.speed.y > 0.05) {
                sprite.speed.y = 0;
            }
        }
    };

    p.spriteHitsPlatformBelow = function (sprite, game) {
    	return sprite.affects.physics.gravity && game.physics.gravity.y > 0 && sprite.collision.sprite.down && game.scene.sprites[sprite.collision.sprite.id].platform;
    };

    p.spriteHitsPlatformAbove = function (sprite, game) {
      	return sprite.affects.physics.gravity && game.physics.gravity.y < 0 && sprite.collision.sprite.up && game.scene.sprites[sprite.collision.sprite.id].platform;
    };

    p.spriteHitsPlatformRight = function (sprite, game) {
      	return sprite.affects.physics.gravity && game.physics.gravity.x > 0 && sprite.collision.sprite.right && game.scene.sprites[sprite.collision.sprite.id].platform;
    };

    p.spriteHitsPlatformLeft = function (sprite, game) {
		return sprite.affects.physics.gravity && game.physics.gravity.x < 0 && sprite.collision.sprite.left && game.scene.sprites[sprite.collision.sprite.id].platform;
    };

    p.spriteSlowerThanCollisionSprite = function (axis, sprite, game) {
        return sprite.speed[axis] >= 0 && sprite.speed[axis] < game.scene.sprites[sprite.collision.sprite.id].speed[axis];
    };

    p.spriteFasterThanCollisionSprite = function (axis, sprite, game) {
        return sprite.speed[axis] <= 0 && sprite.speed[axis] > game.scene.sprites[sprite.collision.sprite.id].speed[axis];
    };

    p.increaseAcceleration = function (sprite) {
        sprite.speed.x += sprite.acceleration.x;
        sprite.speed.y += sprite.acceleration.y;
    };

    p.setSpeed = function (sprite) {
        var sx = sprite.speed.x >= 0 ? 1 : -1;
        var sy = sprite.speed.y >= 0 ? 1 : -1;
        if (Math.abs(sprite.speed.x) > sprite.speed.max.x) {
            sprite.speed.x = sprite.speed.max.x * sx;
        }
        if (Math.abs(sprite.speed.y) > sprite.speed.max.y) {
            sprite.speed.y = sprite.speed.max.y * sy;
        }
    };

    p.addGravity = function (sprite, game) {
        sprite.speed.x -= sprite.speed.gravity.x;
        sprite.speed.y -= sprite.speed.gravity.y;
        if (sprite.affects.physics.gravity) {
            sprite.speed.gravity.x += game.physics.gravity.x;
            sprite.speed.gravity.y += game.physics.gravity.y;
        }
        sprite.speed.x += sprite.speed.gravity.x;
        sprite.speed.y += sprite.speed.gravity.y;
    };

    p.cleanUpSpeed = function (sprite) {
        sprite.speed.x = parseFloat(sprite.speed.x.toFixed(3));
        sprite.speed.y = parseFloat(sprite.speed.y.toFixed(3));
        sprite.speed.t.x += sprite.speed.x;
        sprite.speed.t.y += sprite.speed.y;
        sprite.speed.t.x = parseFloat(sprite.speed.t.x.toFixed(3));
        sprite.speed.t.y = parseFloat(sprite.speed.t.y.toFixed(3));
        sprite.resetAcceleration();
        if (sprite.speed.x === 0) {
            sprite.speed.t.x = 0;
        }
        if (sprite.speed.y === 0) {
            sprite.speed.t.y = 0;
        }
    };

    return function (game) {
        var sprite;
        for (var i = 0; i < game.scene.sprites.length; i++) {
            sprite = game.scene.sprites[i];

            if (sprite.affects.physics.friction) {
                p.addFriction(sprite, game);
            }
            
            if (p.spriteHitsPlatformBelow(sprite, game) || p.spriteHitsPlatformAbove(sprite, game)) {

                if (p.spriteSlowerThanCollisionSprite('x', sprite, game)) {
                    sprite.speed.x = game.scene.sprites[sprite.collision.sprite.id].speed.x;
                } else if (p.spriteFasterThanCollisionSprite('x', sprite, game)) {
                    sprite.speed.x = game.scene.sprites[sprite.collision.sprite.id].speed.x;
                }

            } else if (p.spriteHitsPlatformRight(sprite, game) || p.spriteHitsPlatformLeft(sprite, game)) {

                if (p.spriteSlowerThanCollisionSprite('y', sprite, game)) {
                    sprite.speed.y = game.scene.sprites[sprite.collision.sprite.id].speed.y;
                } else if (p.spriteFasterThanCollisionSprite('y', sprite, game)) {
                    sprite.speed.y = game.scene.sprites[sprite.collision.sprite.id].speed.y;
                }

            }

            p.increaseAcceleration(sprite);
            p.setSpeed(sprite);
            p.addGravity(sprite, game);
            p.cleanUpSpeed(sprite);

        }

    }

});
Molecule.module('Molecule.Scene', function (require, p) {

	function Scene(_game) {
		this.sprites = new Array();
		this.text = new Array();
	};

    return Scene;

});
Molecule.module('Molecule.Sound', function (require, p) {

	function Sound() {
		this.sound = null;
	};
	
	Sound.prototype.play = function(_loop) {
		_loop = _loop || false;
		if(this.sound.currentTime === this.sound.duration) {
			this.stop();
		}
		this.sound.loop = _loop;
		this.sound.play();
	};
	
	Sound.prototype.pause = function() {
		this.sound.pause();
	};
	
	Sound.prototype.stop = function() {
		this.sound.pause();
		this.sound.currentTime = 0;
	};
	
	return Sound;

});
Molecule.module('Molecule.Sprite', function (require, p) {

    var Animation = require('Molecule.Animation');

	// Sprite var.
    function Sprite(_name, _width, _height) {
        this.name = _name;
        this.image = null;
        this.position = {x: 0, y: 0, absolute: {x: 0, y: 0}};
        this.rotation = 0;
        this.move = {x: 0, y: 0};
        this.flip = {x: false, y: false, offset: {x: 0, y: 0}, f: {x: 0, y: 0}};
        this.anchor = {x: 0, y: 0};
        this.visible = true;
        this.alpha = 1;
        this.frame = {width: _width, height: _height, offset: {width: 0, height: 0}};
        this.animation = new Animation(this.frame.width, this.frame.height);
        this.size = {width: 0, height: 0};
        this.collides = {sprite: true, map: true};
        this.scrollable = true;
        this.collidable = true;
        this.platform = false;
        this.bounciness = false;
        this.acceleration = {x: 0, y: 0};
        this.speed = {x: 0, y: 0, t: {x: 0, y: 0}, max: {x: 100, y: 100}, min: {x: 0, y: 0}, check: {x: false, y: false}, gravity: {x: 0, y: 0}};
        this.affects = {physics: {gravity: true, friction: true}};
        this.collision = {map: {up: false, down: false, left: false, right: false, tile: null}, sprite: {up: false, down: false, left: false, right: false, id: null}, check: {map: {up: true, down: true, left: true, right: true}}};
        this.scroll = {offset: {x: 0, y: 0}};
        this.overlap = false;
        this.kill = false;
        this.game = null;

        return this;
    };

    Sprite.prototype.getAnimation = function () {
        this.size = {width: this.image.width, height: this.image.height};
        this.frame.width = this.frame.width || this.size.width;
        this.frame.height = this.frame.height || this.size.height;
        this.animation.sliceFrames(this.image.width, this.image.height, this.frame.width, this.frame.height);
    };

	// Sprite prototype Method flipUpdate
    Sprite.prototype.flipUpdate = function () {
        this.flip.offset.x = this.flip.x ? -this.frame.width : 0;
        this.flip.offset.y = this.flip.y ? -this.frame.height : 0;
        this.flip.f.x = this.flip.x ? -1 : 1;
        this.flip.f.y = this.flip.y ? -1 : 1;
    };

	// Sprite prototype Method update
    Sprite.prototype.update = function () {
        this.position.x += this.move.x;
        this.position.y += this.move.y;
        this.position.x = parseFloat(this.position.x.toFixed(3));
        this.position.y = parseFloat(this.position.y.toFixed(3));
        this.position.absolute.x = this.position.x;
        this.position.absolute.y = this.position.y;
        if (this.game.map.getMainLayer() !== -1) {
            this.position.absolute.x += Math.abs(this.game.map.json.layers[this.game.map.getMainLayer()].x);
            this.position.absolute.y += Math.abs(this.game.map.json.layers[this.game.map.getMainLayer()].y);
        }
        this.size.width = this.frame.width - this.frame.offset.width;
        this.size.height = this.frame.height - this.frame.offset.height;
    };

	// Sprite prototype Method resetMove
    Sprite.prototype.resetMove = function () {
        this.move = {x: 0, y: 0};
    };

	// Sprite prototype Method reset acceleration
    Sprite.prototype.resetAcceleration = function () {
        this.acceleration = {x: 0, y: 0};
    };

	// Sprite prototype Method draw
    Sprite.prototype.draw = function (_overlap) {
        if (this.overlap === _overlap) {
            this.game.context.save();
            this.game.context.globalAlpha = this.alpha;
            this.game.context.scale(1 * this.flip.f.x, 1 * this.flip.f.y);
            this.game.context.translate(Math.round((this.position.x * this.flip.f.x) + this.flip.offset.x), Math.round((this.position.y * this.flip.f.y) + this.flip.offset.y));
            this.game.context.rotate(this.rotation * (Math.PI / 180));
            this.game.context.translate(Math.round(-this.anchor.x * this.flip.f.x), Math.round(-this.anchor.y * this.flip.f.y));
            this.game.context.drawImage(this.image, this.animation.frame[this.animation.id[this.animation.current.animation].frame[this.animation.current.frame]].x, this.animation.frame[this.animation.id[this.animation.current.animation].frame[this.animation.current.frame]].y, this.frame.width, this.frame.height, 0, 0, this.frame.width, this.frame.height);
            this.game.context.restore();
        }
    };

	// Sprite prototype Method is_touched
    Sprite.prototype.touch = function () {
        var _touch = this.game.input.touch;
        for (var i = 0; i < _touch.length; i++) {
            if (this.position.x - this.anchor.x <= _touch[i].x && this.position.x - this.anchor.x + this.frame.width - this.frame.offset.width > _touch[i].x && this.position.y - this.anchor.y <= _touch[i].y && this.position.y - this.anchor.y + this.frame.height - this.frame.offset.height > _touch[i].y) {
                return true;
            }
        }
        return false;
    };

	// Sprite prototype Method is_clicked
    Sprite.prototype.click = function (_button) {
        var _mouse = this.game.input.mouse;
        if (this.position.x - this.anchor.x <= _mouse.x && this.position.x - this.anchor.x + this.frame.width - this.frame.offset.width > _mouse.x && this.position.y - this.anchor.y <= _mouse.y && this.position.y - this.anchor.y + this.frame.height - this.frame.offset.height > _mouse.y && _button)
            return true;
        return false;
    };

	// Sprite prototype Method collidesWithSprite
    Sprite.prototype.collidesWithSprite = function (_object) {
        if (((this.position.x - this.anchor.x + this.move.x <= _object.position.x - _object.anchor.x + _object.move.x && this.position.x - this.anchor.x + this.frame.width - this.frame.offset.width + this.move.x > _object.position.x - _object.anchor.x + _object.move.x) || (_object.position.x - _object.anchor.x + _object.move.x <= this.position.x - this.anchor.x + this.move.x && _object.position.x - _object.anchor.x + _object.move.x + _object.frame.width - _object.frame.offset.width > this.position.x - this.anchor.x + this.move.x)) && ((this.position.y - this.anchor.y + this.move.y <= _object.position.y - _object.anchor.y + _object.move.y && this.position.y - this.anchor.y + this.frame.height - this.frame.offset.height + this.move.y > _object.position.y - _object.anchor.y + _object.move.y) || (_object.position.y - _object.anchor.y + _object.move.y <= this.position.y - this.anchor.y + this.move.y && _object.position.y - _object.anchor.y + _object.move.y + _object.frame.height - _object.frame.offset.height > this.position.y - this.anchor.y + this.move.y)))
            return true;
        return false;
    };

	// Sprite prototype Method collidesWithTile
    Sprite.prototype.collidesWithTile = function (_layer, _tile, _j) {
        var _lpx = Math.abs(_layer.x);
        var _lpy = Math.abs(_layer.y);

        _object = {position: {x: Math.floor(_tile % _layer.width) * this.game.map.json.tilewidth, y: Math.floor(_tile / _layer.width) * this.game.map.json.tilewidth}, width: this.game.map.json.tilesets[this.game.map.getTileset(_layer.data[_tile])].tilewidth, height: this.game.map.json.tilesets[this.game.map.getTileset(_layer.data[_tile])].tileheight};

        var px1 = this.position.x - this.anchor.x + this.move.x + _lpx;
        var px2 = this.position.x - this.anchor.x + this.frame.width - this.frame.offset.width + this.move.x + _lpx;
        var px3 = this.position.x - this.anchor.x + this.move.x + _lpx;
        var px4 = this.position.x - this.anchor.x + this.move.x + _lpx;
        if (_layer.properties.scroll.infinite.x) {
            if (px1 >= this.game.map.canvas[_j].width) {
                px1 = Math.floor(px1 % this.game.map.canvas[_j].width);
            }
            if (px2 >= this.game.map.canvas[_j].width) {
                px2 = Math.floor(px2 % this.game.map.canvas[_j].width);
            }
            if (px3 >= this.game.map.canvas[_j].width) {
                px3 = Math.floor(px3 % this.game.map.canvas[_j].width);
            }
            if (px4 >= this.game.map.canvas[_j].width) {
                px4 = Math.floor(px4 % this.game.map.canvas[_j].width);
            }
        }

        var py1 = this.position.y - this.anchor.y + this.move.y + _lpy;
        var py2 = this.position.y - this.anchor.y + this.frame.height - this.frame.offset.height + this.move.y + _lpy;
        var py3 = this.position.y - this.anchor.y + this.move.y + _lpy;
        var py4 = this.position.y - this.anchor.y + this.move.y + _lpy;
        if (_layer.properties.scroll.infinite.y) {
            if (py1 >= this.game.map.canvas[_j].height) {
                py1 = Math.floor(py1 % this.game.map.canvas[_j].height);
            }
            if (py2 >= this.game.map.canvas[_j].height) {
                py2 = Math.floor(py2 % this.game.map.canvas[_j].height);
            }
            if (py3 >= this.game.map.canvas[_j].height) {
                py3 = Math.floor(py3 % this.game.map.canvas[_j].height);
            }
            if (py4 >= this.game.map.canvas[_j].height) {
                py4 = Math.floor(py4 % this.game.map.canvas[_j].height);
            }
        }

        if (((px1 <= _object.position.x && px2 > _object.position.x) || (_object.position.x <= px3 && _object.position.x + _object.width > px4)) && ((py1 <= _object.position.y && py2 > _object.position.y) || (_object.position.y <= py3 && _object.position.y + _object.height > py4)))
            return true;
        return false;
    };

    return Sprite;

});
Molecule.module('Molecule.SpriteCollisions', function (require, p) {

    p.spritesCollide = function (spriteI, spriteJ) {
        return (spriteI.collides.sprite && spriteJ.collidable && spriteI.collidable) && (spriteI.collidesWithSprite(spriteJ))
    };

    p.updateCollisionY = function (spriteI, spriteJ, i, j, physics) {
        if (spriteI.collidesWithSprite(spriteJ)) {
            if (spriteI.move.y > 0) {
                spriteI.collision.sprite.down = true;
                spriteJ.collision.sprite.up = true;
            }
            if (spriteI.move.y < 0) {
                spriteI.collision.sprite.up = true;
                spriteJ.collision.sprite.down = true;
            }
            if (spriteI.collision.sprite.down && physics.gravity.y > 0) {
                spriteI.speed.gravity.y = 0;
            }
            if (spriteI.collision.sprite.up && physics.gravity.y < 0) {
                spriteI.speed.gravity.y = 0;
            }
            spriteI.collision.sprite.id = j;
            spriteJ.collision.sprite.id = i;
            spriteI.move.y = 0;
            spriteI.speed.y = 0;
            spriteI.speed.t.y = 0;
        }
    };

    p.updateCollisionX = function (spriteI, spriteJ, i, j, physics) {
        if (spriteI.collidesWithSprite(spriteJ)) {
            if (spriteI.move.x > 0) {
                spriteI.collision.sprite.right = true;
                spriteJ.collision.sprite.left = true;
            }
            if (spriteI.move.x < 0) {
                spriteI.collision.sprite.left = true;
                spriteJ.collision.sprite.right = true;
            }
            if (spriteI.collision.sprite.left && physics.gravity.x < 0) {
                spriteI.speed.gravity.x = 0;
            }
            if (spriteI.collision.sprite.right && physics.gravity.x > 0) {
                spriteI.speed.gravity.x = 0;
            }
            spriteI.collision.sprite.id = j;
            spriteJ.collision.sprite.id = i;
            spriteI.move.x = 0;
            spriteI.speed.x = 0;
            spriteI.speed.t.x = 0;
        }
    };

    return function (game) {
        var sprites = game.scene.sprites,
            physics = game.physics,
            i,
            j,
            mc,
            tx,
            ty,
            tjx,
            tjy,
            spriteI,
            spriteJ;

        for (i = 0; i < sprites.length; i++) {
            spriteI = sprites[i];
            for (j = 0; j < sprites.length; j++) {
                spriteJ = sprites[j];

                if (i !== j) {

                    tjx = spriteJ.move.x;
                    tjy = spriteJ.move.y;

                    if (p.spritesCollide(spriteI, spriteJ)) {

                        if (j > i) {
                            spriteJ.move.x = 0;
                            spriteJ.move.y = 0;
                        }

                        if (p.spritesCollide(spriteI, spriteJ)) {
                            mc = 0;
                            while (mc <= 2) {
                                if (spriteI.move.x !== 0 || spriteI.move.y !== 0) {
                                    if (mc === 0 || mc === 2) {
                                        tx = spriteI.move.x;
                                        spriteI.move.x = 0;
                                        p.updateCollisionY(spriteI, spriteJ, i, j, physics);
                                        spriteI.move.x = tx;
                                    }
                                    if (mc === 1 || mc === 2) {
                                        ty = spriteI.move.y;
                                        if (mc !== 2)
                                            spriteI.move.y = 0;
                                        p.updateCollisionX(spriteI, spriteJ, i, j, physics);
                                        spriteI.move.y = ty;
                                    }
                                }
                                mc++;
                            }
                        }
                    }
                    spriteJ.move.x = tjx;
                    spriteJ.move.y = tjy;
                }
            }
        }
    };
});
Molecule.module('Molecule.Text', function (require, p) {

	function Text (_font, _x, _y, _title, _game) {
		this.game = _game;
		this.title = _title === undefined ? null : _title;
		this.x = _x || 0;
		this.y = _y || 0;
		this.align = 'left';
		this.font = _font;
		this.color = '#FFFFFF';
		this.baseline = 'top';
		this.alpha = 1;
		this.visible = true;
		this.stroke = {enable: false, color: '#000000'};
	};

	Text.prototype.draw = function() {
		this.game.context.save();
		if(this.font !== null) {
			this.game.context.font = this.font;
		}
		this.game.context.globalAlpha = this.alpha;
		this.game.context.textAlign = this.align;
		this.game.context.textBaseline = this.baseline;
		this.game.context.fillStyle = this.color;
		this.game.context.fillText(this.title, this.x, this.y);
		if(this.stroke.enable) {
			this.game.context.strokeStyle = this.stroke.color;
			this.game.context.strokeText(this.title, this.x, this.y);
		}
		this.game.context.restore();
	};

	Text.prototype.measure = function() {
		return this.game.context.measureText(this.title).width;
	};

	return Text;

});

Molecule.module('Molecule.Tile', function (require, p) {

	function Tile(_game) {
		this.game = _game;
	};

	Tile.prototype.get = function(_name, _x, _y) {
		var t = this.game.map.getTileData(_name, _x, _y);
		return t;
	};

	Tile.prototype.set = function(_name, _x, _y, _tileset, _tile) {
		this.game.map.setTile(_name, _x, _y, _tileset, _tile);
	};

	Tile.prototype.clear = function(_name, _x, _y) {
		var t = this.game.map.clearTile(_name, _x, _y);
		return t;
	};

	return Tile;

});
