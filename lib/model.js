;(function(Backbone) {
'use strict';

var Cord = Backbone.Cord;
var Model = Cord.Model;
var getFunctionArgs = Cord.getFunctionArgs;

function _detectComputedChanges() {
	var i, key, keys;
	var change, changed = this.changedAttributes();
	var newChanged = {};
	for(change in changed) {
		if(this._computedArgs[change]) {
			keys = this._computedArgs[change];
			for(i = 0; i < keys.length; ++i) {
				key = keys[i];
				if(!newChanged[key]) {
					newChanged[key] = this.get(key);
					this.trigger('change:' + key, this, newChanged[key], {});
				}
			}
		}
	}
	// To not interefer with the current change event, use setImmediate to modify the changed object
	Cord.setImmediate(function() {
		this.changed = newChanged;
		this.trigger('change', this, {});
	}.bind(this), 0);
}

function _wrapComputedFunc(func, args) {
	return function() {
		var i, values = [];
		for(i = 0; i < args.length; ++i)
			values.push(this.get(args[i]));
		return func.apply(this, values);
	};
}

// Extend computed attribute capabilities to Backbone models
Model.prototype._addComputed = function(key, func) {
	var __get, i, arg, args = getFunctionArgs(func);
	if(!this._computed) {
		this._computed = {};
		this._computedArgs = {};
		__get = this.get;
		this.get = function(attr) {
			var compFun = this._computed[attr];
			if(compFun)
				return compFun.call(this);
			return __get.call(this, attr);
		};
		this.listenTo(this, 'change', _detectComputedChanges);
	}
	this._computed[key] = _wrapComputedFunc(func, args);
	for(i = 0; i < args.length; ++i) {
		arg = args[i];
		if(!this._computedArgs[arg])
			this._computedArgs[arg] = [];
		this._computedArgs[arg].push(key);
	}
};

// Wrap extend to wrap the initialize method
var __extend = Model.extend;
Model.extend = function(properties, staticProps) {
	var __initialize;
	staticProps = staticProps || {};
	// Apply any computed attributes on initialize
	if(properties.computed) {
		__initialize = properties.initialize || Model.prototype.initialize;
		properties.initialize = function() {
			if(this.computed) {
				for(var attr in this.computed)
					this._addComputed(attr, this.computed[attr]);
			}
			return __initialize.apply(this, arguments);
		};
	}
	// Copy useful references from properties to staticProps for easier accessibility
	staticProps.choices = properties.choices;
	staticProps.defaults = properties.defaults;
	staticProps.instructions = properties.instructions;
	staticProps.titles = properties.titles;
	staticProps.subtitles = properties.subtitles;
	staticProps.rules = properties.rules;
	return __extend.call(this, properties, staticProps);
};

})(((typeof self === 'object' && self.self === self && self) || (typeof global === 'object' && global.global === global && global)).Backbone || require('backbone'));
