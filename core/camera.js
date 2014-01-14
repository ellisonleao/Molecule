// Camera var. Arguments: canvas
function Camera(_game) {
	this.canvas = _game.canvas;
	this.game = _game;
	this.layer = null;
	this.sprite = null;
	this.scroll = {x: false, y: false};
	this.type = 0;
	
	return this;
};

// Method for attach an sprite, map, and main layer
Camera.prototype.attach = function(_sprite) {
	this.layer = this.game.map.getLayerIdByName();
	this.sprite = _sprite;
	this.type = 1;
};

// Method for update the camera. It will update map & sprite
Camera.prototype.update = function(_sprite) {
	if(this.game.map !== null && this.layer !== -1) {
		this.makeScroll(this.game.map);
		this.makeMapScroll(this.game.map);
	}
	this.makeSpriteScroll(_sprite, this.sprite.move.x, this.sprite.move.y);
};

// Method to check if scroll is necessary
Camera.prototype.makeScroll = function() {
	this.scroll.x = false;
	this.scroll.y = false;
	if(this.game.map.layer.length > 0 && this.game.map.layer[this.layer].scrollable) {
		if((-this.game.map.layer[this.layer].position.x + this.game.canvas.width < this.game.map.width * this.game.map.tile.width && this.sprite.move.x > 0 && this.sprite.position.x - this.sprite.anchor.x + this.sprite.frame.width / 2 >= this.game.canvas.width / 2) || (-this.game.map.layer[this.layer].position.x > 0 && this.sprite.move.x < 0 && this.sprite.position.x - this.sprite.anchor.x + this.sprite.frame.width / 2 <= this.game.canvas.width / 2)) {
			this.scroll.x = true;
		}
		if((-this.game.map.layer[this.layer].position.y + this.game.canvas.height < this.game.map.height * this.game.map.tile.height && this.sprite.move.y > 0 && this.sprite.position.y - this.sprite.anchor.y + this.sprite.frame.height / 2>= this.game.canvas.height / 2) || (-this.game.map.layer[this.layer].position.y > 0 && this.sprite.move.y < 0 && this.sprite.position.y - this.sprite.anchor.y + this.sprite.frame.height / 2<= this.game.canvas.height / 2)) {
			this.scroll.y = true;
		}
	}
};

// Method to scroll map
Camera.prototype.makeMapScroll = function() {
	for(var i = 0; i < this.game.map.layer.length; i++) {
		if(this.game.map.layer[i].scrollable) {
			if((-this.game.map.layer[i].position.x + this.game.canvas.width < this.game.map.width * this.game.map.tile.width && this.sprite.move.x > 0 && this.sprite.position.x - this.sprite.anchor.x + this.sprite.frame.width / 2 >= this.game.canvas.width / 2) || (-this.game.map.layer[i].position.x > 0 && this.sprite.move.x < 0 && this.sprite.position.x - this.sprite.anchor.x + this.sprite.frame.width / 2 <= this.game.canvas.width / 2)) {
				if(this.scroll.x) {
					if(i !== this.layer) {
						this.game.map.layer[i].scroll.x = this.sprite.move.x * -this.game.map.layer[i].scroll.speed;
					} else {
						this.game.map.layer[i].scroll.x = -this.sprite.move.x;
					}
					
				}
			}
			if((-this.game.map.layer[i].position.y + this.game.canvas.height < this.game.map.height * this.game.map.tile.height && this.sprite.move.y > 0 && this.sprite.position.y - this.sprite.anchor.y + this.sprite.frame.height / 2>= this.game.canvas.height / 2) || (-this.game.map.layer[i].position.y > 0 && this.sprite.move.y < 0 && this.sprite.position.y - this.sprite.anchor.y + this.sprite.frame.height / 2<= this.game.canvas.height / 2)) {
				if(this.scroll.y) {
					if(i !== this.layer) {
						this.game.map.layer[i].scroll.y = this.sprite.move.y * -this.game.map.layer[i].scroll.speed;
					} else {
						this.game.map.layer[i].scroll.y = -this.sprite.move.y;
					}
				}
			}
		}
	}
};

// Method to scroll sprite
Camera.prototype.makeSpriteScroll = function(_sprite, _x, _y) {
	for(var i = 0; i < _sprite.length; i++) {
		if(_sprite[i].scrollable) {
			if(this.scroll.x) {
				_sprite[i].move.x = _sprite[i].move.x - _x;
			}
			if(this.scroll.y) {
				_sprite[i].move.y = _sprite[i].move.y - _y;
			}
		}
	}
};