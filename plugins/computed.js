;(function(Backbone) {
'use strict';

function _getFunctionArgs(func) {
	// Get all argument names for a function
	// Based on http://stackoverflow.com/questions/1007981/how-to-get-function-parameter-names-values-dynamically-from-javascript
	var str = func.toString();
	var args = str.slice(str.indexOf('(') + 1, str.indexOf(')')).match(/([^\s,]+)/g);
	if(!args)
		args = [];
	return args;
}

function _detectComputedChanges() {
	var i, key, keys;
	var change, changed = this.changedAttributes();
	var newChanged = {};
	for(change in changed) {
		if(changed.hasOwnProperty(change) && this._computedArgs[change]) {
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
	// To not interefer with the current change event, use setTimeout to modify the changed object
	setTimeout(function() {
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
Backbone.Model.prototype._addComputed = function(key, func) {
	var __get, i, arg, args = _getFunctionArgs(func);
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
var __extend = Backbone.Model.extend;
Backbone.Model.extend = function(properties) {
	var __initialize;
	if(properties.computed) {
		__initialize = properties.initialize || Backbone.Model.prototype.initialize;
		properties.initialize = function() {
			if(this.computed) {
				for(var attr in this.computed) {
					if(this.computed.hasOwnProperty(attr))
						this._addComputed(attr, this.computed[attr]);
				}
			}
			return __initialize.apply(this, Array.prototype.slice.call(arguments));
		};
	}
	return __extend.apply(this, Array.prototype.slice.call(arguments));
};

function _createArgObserver(key, getFunc, args) {
	return function() {
		var i, values = [];
		for(i = 0; i < args.length; ++i)
			values.push(this.getValueForKey(args[i]));
		this[key] = getFunc.apply(this, values);
	};
}

Backbone.Cord.plugins.push({
	name: 'computed',
	initialize: function() {
		// Enumerate all of the get properties to determine which has a get method with arguments
		if(this.properties) {
			var key, prop, args, i, observer;
			for(key in this.properties) {
				if(this.properties.hasOwnProperty(key)) {
					prop = Object.getOwnPropertyDescriptor(this, key);
					if(prop && prop.get) {
						args = _getFunctionArgs(prop.get);
						if(args.length) {
							// The observer method then will call this._setKey(argValues...);
							observer = _createArgObserver(key, prop.get, args);
							for(i = 0; i < args.length; ++i)
								this.observe(args[i], observer, i === 0);
							// The get then needs to be replaced with a default getter
							Object.defineProperty(this, key, {get: this._synthesizeGetter(key)});
						}
					}
				}
			}
		}
	}
});

})(((typeof self === 'object' && self.self === self && self) || (typeof global === 'object' && global.global === global && global)).Backbone || require('backbone'));
