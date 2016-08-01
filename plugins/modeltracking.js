;(function(Backbone) {
'use strict';

// One-way attribute(s) tracking
Backbone.Model.prototype.track = function(model, attrs, transform) {
	if(typeof attrs === 'function') {
		transform = attrs;
		attrs = null;
	}
	transform = transform || function(data) { return data; };
	if(!attrs) {
		this.listenTo(model, 'change', function(model, options) {
			if(!options._track) {
				options = Backbone.Cord.copyObj(options);
				options._track = true;
				this.set(transform(model.attributes), options);
			}
		});
	}
	else {
		var createListener = function(attr) {
			return function(model, value, options) {
				var data = {};
				data[attr] = value;
				if(!options._track) {
					options = Backbone.Cord.copyObj(options);
					options._track = true;
					this.set(transform(data), options);
				}
			};
		};
		if(typeof attrs === 'string')
			attrs = [attrs];
		for(var i = 0; i < attrs.length; ++i) {
			this.listenTo(model, 'change:' + attrs[i], createListener(attrs[i]));
		}
	}
	return this;
};

// Used for both subobjects and models that are transformed from others
// Submodels could be created on initialize like in the backbone docs
// Transformed modules could be created on the cascade method
Backbone.Model.prototype.subsume = function(cls, attr, transform) {
	var sub = new cls();
	if(typeof attr === 'function') {
		transform = attr;
		attr = null;
	}
	transform = transform || sub.transform || function(data) { return data; };
	// Proxy communication events
	sub.listenTo(this, 'request sync error', function() {
		this.trigger.apply(this, arguments);
	});
	// Perform the initial set and setup tracking
	if(attr) {
		if(Object.keys(this.get(attr)).length)
			sub.set(transform(sub.parse(this.get(attr))));
		sub.track(this, attr, function(data) { return data[attr]; });
		this.track(sub, function(data) { var attrs = {}; attrs[attr] = data; return attrs; });
	}
	else {
		if(Object.keys(this.attributes).length)
			sub.set(transform(sub.parse(this.attributes)));
		sub.track(this, transform);
	}
	return sub;
};

// Two-way tracking
Backbone.Model.prototype.mirror = function(model, attrs) {
	this.track(model, attrs);
	model.track(this, attrs);
	return this;
};

// Plugin doesn't actually do anything but register it anyways
Backbone.Cord.plugins.push({ name: 'modeltracking' });

})(((typeof self === 'object' && self.self === self && self) || (typeof global === 'object' && global.global === global && global)).Backbone || require('backbone'));
