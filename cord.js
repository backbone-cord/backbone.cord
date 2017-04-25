;(function(root) {
'use strict';

var Backbone = root.Backbone || require('backbone');
var compatibilityMode = root.cordCompatibilityMode;
var debug = root.cordDebug;

// Initialize the Cord View class depending on the compatibility mode
var View = compatibilityMode ? Backbone.View.extend({}) : Backbone.View;
var Model = compatibilityMode ? Backbone.Model.extend({}) : Backbone.Model;
var Collection = compatibilityMode ? Backbone.Collection.extend({}) : Backbone.Collection;

/*
 * Main Cord object.
 * Do NOT overwrite any top-level members, only modify sub objects such as Cord.regex.x
 * Inside modules, only alias top-level members not the modifiable nested because those may change, for example var regex = Cord.regex
 */
var Cord = Backbone.Cord = {
	VERSION: '1.0.22',
	config: {
		idProperties: true,
		prefixCreateElement: false
	},
	// Collection of reusable regular expression objects
	// NOTE: Do not use the regex functions test/exec when the global flag is set because it is stateful (lastIndex). Instead use string methods search/match
	// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Regular_Expressions#Working_with_regular_expressions
	regex: {
		idPropertyTest: /^[a-zA-Z_$][0-9a-zA-Z_$]*$/,
		idSelectorValues: /#([a-zA-Z_$][0-9a-zA-Z_$]*)/g
	},
	// Plugins install themselves by pushing to this array
	plugins: [],
	// Filters installed by the app by setting keys on this object
	filters: {
		lower: function(str) { return Cord.convertToString(str).toLowerCase(); },
		upper: function(str) { return Cord.convertToString(str).toUpperCase(); },
		title: function(str) { return Cord.convertToString(str).replace(/\b[^\s-]*/g, function(s) { return s.charAt(0).toUpperCase() + s.substr(1).toLowerCase(); }); }
	},
	// Value decoders and encoders for when "value" is get or set on an element, keys into decoders/encoders is based on the data-type and type attribute
	decoders: {
		range: function(el) { return parseInt(el.value); },
		number: function(el) { return Number(el.value); },
		int: function(el) { return parseInt(el.value); },
		integer: function(el) { return parseInt(el.value); },
		float: function(el) { return parseFloat(el.value); },
		decimal: function(el) { return parseFloat(el.value); },
		date: function(el) { return new Date(el.value); },
		datetime: function(el) { return new Date(el.value); },
		bool: function(el) { return el.checked; },
		checkbox: function(el) { return el.checked; }
	},
	encoders: {
		date: function(el, value) { el.value = value.toDateString(); },
		datetime: function(el, value) { el.value = value.toString(); },
		bool: function(el, value) { el.checked = Cord.convertToBool(value); },
		checkbox: function(el, value) { el.checked = Cord.convertToBool(value); }
	},
	decodeValue: function(el) {
		var decoder = Cord.decoders[el.getAttribute('data-type') || el.getAttribute('type')];
		if(el.hasAttribute('data-null') && !el.value)
			return null;
		return decoder ? decoder(el) : el.value;
	},
	encodeValue: function(el, value) {
		var encoder = Cord.encoders[el.getAttribute('data-type') || el.getAttribute('type')];
		if(encoder)
			encoder(el, value);
		else
			el.value = Cord.convertToString(value);
		var evt = document.createEvent('HTMLEvents');
		evt.initEvent('change', true, true);
		el.dispatchEvent(evt);
	},
	// Mixins installed by the app by setting keys on this object
	mixins: {},
	convertToString: function(obj) { if(obj === null || obj === void(0)) return ''; return obj.toString(); },
	convertToBool: function(value) { return !!(value && (value.length === void(0) || value.length)); },
	convertToNumber: function(value) { return Number(value) || 0; },
	// Generate a 2-byte time-secured random uid by taking the last 4 characters of a number between 0x10000 and 0x20000
	randomUID: function() { return (Math.floor((1 + Math.random()) * 0x10000) ^ (Date.now() % 0x10000)).toString(16).substr(1); }, // jshint ignore:line
	randomGUID: function() { var c4 = Cord.randomUID; return c4() + c4() + '-' + c4() + '-' + c4() + '-' + c4() + '-' + c4() + c4() + c4(); },
	randomCode: function(len) { var c = ''; len = len || 12; while(c.length < len) c += Cord.randomUID(); return c.substr(0, len); },
	// Run a callback immediately after the current call stack
	setImmediate: (root.requestAnimationFrame || root.setTimeout).bind(root),
	clearImmediate: (root.cancelAnimationFrame || root.clearTimeout).bind(root),
	// Internally set readonly properties with the ForceValue object
	ForceValue: function(value) { this.value = value; },
	// View, Model, and Collection
	View: View,
	Model: Model,
	Collection: Collection,
	// EmptyView, EmptyModel, and EmptyCollection to use as default model, subview placeholder, and fallback collection on setCollection(null)
	EmptyView: View.extend({ tagName: 'meta' }),
	EmptyModel: new (Model.extend({set: function() { return this; }, toString: function() { return ''; }}))(),
	EmptyCollection: new (Collection.extend({add: function() { return this; }, reset: function() { return this; }, set: function() { return this; }, toString: function() { return ''; }}))(),
	// Unique internal subview id, this unifies how subviews with and without ids are stored
	_sid: 1,
	_pluginsChecked: false,
	_scopes: {},
	// NOTE: classes, attrs, children, and bindings are all copies and may be modified by plugins without side-effects
	// modifications will be recognized by the default behavior and returning the copy is not necessary
	_callbacks: {
		// (el) tag can process the tag value and return an element overriding the default createElement
		tag: [],
		// (el and subview) classes is an array of classname, returning [] will prevent default classes being applied
		classes: [],
		// (el conditionally invoked) attrs is a dict, returning {} will prevent default attrs being applied
		attrs: [],
		// (el conditionally invoked) children is an array of strings or dom elements
		children: [],
		// (subview) bindings that by default get converted to event listeners
		bindings: [],
		// (el and subview) when creation and setup is complete, right before el and subview return, returning a different element can replace an el
		complete: [],
		// View Class extending only, where this is the parent class and context has protoProps and staticProps arguments
		extend: [],
		// (new View) create, initialize, and remove apply to all views
		create: [],
		initialize: [],
		remove: []
	}
};

// Returns true if the given object is an instance of Object and not of a subclass or other type
function _isPlainObj(obj) {
	// First check of just obj is needed because typeof null is object
	return (obj && typeof obj === 'object' && Object.getPrototypeOf(obj) === Object.prototype);
}

// Create a deep copy of plain objects
// Anything not a plain object (subclass, function, array, etc) will be copied by reference
function _copyObj(obj) {
	var key, value, copy = {};
	for(key in obj) {
		if(obj.hasOwnProperty(key)) {
			value = obj[key];
			if(_isPlainObj(value))
				value = _copyObj(value);
			copy[key] = value;
		}
	}
	return copy;
}

// Internal use only for when there are one or more subkeys to resolve on an object, view, or model
function _getObjValue(obj, keys) {
	var i, key;
	keys = Array.isArray(keys) ? keys : keys.split('.');
	for(i = 0; i < keys.length; ++i) {
		key = keys[i];
		if(obj.getValueForKey) {
			// If a namespace is included in the keys pass the pair (which is still a single key) to getValueForKey
			if(Cord._scopes[key.toLowerCase()] && ((i + 1) < keys.length)) {
				i += 1;
				key = key + '.' + keys[i];
			}
			obj = obj.getValueForKey(key);
		}
		else if(obj instanceof Backbone.Model) {
			obj = (key === 'id' ? obj.id : obj.get(key));
		}
		else if(obj) {
			if(key === 'value' && obj.nodeType === Node.ELEMENT_NODE)
				obj = Cord.decodeValue(obj);
			else
				obj = obj[key];
		}
	}
	return obj;
}
function _setObjValue(obj, keys, value) {
	var key;
	keys = Array.isArray(keys) ? keys : keys.split('.');
	obj = _getObjValue(obj, keys.slice(0, -1));
	key = keys[keys.length - 1];
	if(obj.setValueForKey) {
		obj.setValueForKey(key, value);
	}
	else if(obj instanceof Backbone.Model) {
		obj.set((key === 'id' ? obj.idAttribute : key), value);
	}
	else if(obj) {
		if(key === 'value' && obj.nodeType === Node.ELEMENT_NODE)
			Cord.encodeValue(obj, value);
		else
			obj[key] = value;
	}
}

// Helper functions for mixing objects and prototypes
function _chain(f1, f2) { return function() { f1.apply(this, arguments); return f2.apply(this, arguments); }; }
function _terminate(f, key) { return function() { var ret = f.apply(this, arguments); var parent = Object.getPrototypeOf(Object.getPrototypeOf(this)); return (parent && parent[key]) ? parent[key].apply(this, arguments) : ret || this; }; }

// Create a copy of obj and mixin the other arguments in order
// Works much like _.extend() but does a recursive merging of plain objects
// Good for creating and using view mixins
// Register mixins with Cord.mixins
function _mixObj(obj) {
	var i, key, value, other, otherValue;
	if(typeof obj === 'string')
		obj = Cord.mixins[obj] || {};
	obj = _copyObj(obj);
	for(i = 1; i < arguments.length; ++i) {
		other = arguments[i];
		if(typeof other === 'string')
			other = Cord.mixins[other] || {};
		for(key in other) {
			if(other.hasOwnProperty(key)) {
				value = obj[key];
				otherValue = other[key];
				if(_isPlainObj(value) && _isPlainObj(otherValue))
					obj[key] = _mixObj(value, otherValue);
				else if(typeof value === 'function' && typeof otherValue === 'function')
					obj[key] = _chain(value, otherValue);
				else
					obj[key] = otherValue;
			}
		}
	}
	return obj;
}

// Same as _mixObj, but will terminate (call parent) any function chains if the last (terminal) obj did not implement the function
function _mixProto() {
	var key, value, obj = _mixObj.apply(this, arguments);
	var terminal = arguments[arguments.length - 1];
	if(typeof terminal === 'string')
		terminal = Cord.mixins[terminal] || {};
	for(key in obj) {
		if(obj.hasOwnProperty(key)) {
			value = obj[key];
			if(typeof value === 'function' && typeof terminal[key] !== 'function')
				obj[key] = _terminate(value, key);
		}
	}
	return obj;
}

// Get all values for a key on a prototype chain, ordered by parent values first
function _getPrototypeValuesForKey(objCls, key, isCls) {
	var proto = isCls ? objCls.prototype : Object.getPrototypeOf(objCls), values = [];
	for(; proto; proto = Object.getPrototypeOf(proto)) {
		if(proto.hasOwnProperty(key))
			values.unshift(proto[key]);
	}
	return values;
}

// Add utility functions
Cord.isPlainObj = _isPlainObj;
Cord.copyObj = _copyObj;
Cord.mixObj = _mixObj;
Cord.mixProto = _mixProto;
Cord.getPrototypeValuesForKey = _getPrototypeValuesForKey;

function _callPlugins(name, context) {
	// For each callbacks, call and return false if false is returned
	// Context object to communicate data between plugins and callbacks
	var callbacks = Cord._callbacks[name];
	var args = Array.prototype.slice.call(arguments, 1);
	delete context[name];
	for(var i = 0; i < callbacks.length; ++i) {
		context[name] = callbacks[i].apply(this, args) || context[name];
	}
	return context[name];
}

Cord._callPlugins = _callPlugins;

Cord.log = (debug ? function() {
	var format = [];
	var args = Array.prototype.slice.call(arguments);
	for(var i = 0; i < args.length; ++i)
		format.push((typeof args[i] === 'object') ? '%O' : '%s');
	args.unshift(format.join(' | '));
	console.log.apply(console, args);
} : function(){});

// Override or wrap to provide different keyPath processing, different prefixes, or shorthands
// The return value must be an array of the different key path components, with the first being the namespace normalized to lowercase
Cord.parseKeyPath = function(keyPath) {
	var components;
	keyPath = keyPath.replace(/__/g, '.');
	components = keyPath.split('.');
	// Default to the view scope
	if(components.length === 1 || !Cord._scopes[components[0].toLowerCase()])
		components.unshift('this');
	else
		components[0] = components[0].toLowerCase();
	return components;
};

// Use get/set attribute because className doesn't work with svg elements
// cls argument for add/remove can be a space separated string or an array of single class strings
Cord.hasClass = function(el, cls) {
	return (el.getAttribute('class') || '').split(' ').indexOf(cls) !== -1;
};
Cord.addClass = function(el, cls) {
	if(!Array.isArray(cls))
		cls = cls.split(' ');
	for(var i = 0; i < cls.length; ++i) {
		if(!Cord.hasClass(el, cls[i]))
			el.setAttribute('class', ((el.getAttribute('class') || '') + ' ' + cls[i]).trim());
	}
};
Cord.removeClass = function(el, cls) {
	var i, clss = (el.getAttribute('class') || '').split(' ');
	if(!Array.isArray(cls))
		cls = cls.split(' ');
	for(i = clss.length - 1; i >= 0; --i) {
		if(cls.indexOf(clss[i]) !== -1)
			clss.splice(i, 1);
	}
	el.setAttribute('class', clss.join(' '));
};

Cord.plugins._check = function() {
	var i, j, plugin, loaded = {};
	for(i = 0; i < this.length; ++i)
		loaded[this[i].name] = true;
	for(i = 0; i < this.length; ++i) {
		plugin = this[i];
		if(plugin.requirements) {
			for(j = 0; j < plugin.requirements.length; ++j)
				if(!loaded[plugin.requirements[j]])
					throw new Error('Cord plugin "' + plugin.name + '" requires missing plugin "' + plugin.requirements[j] + '"');
		}
	}
};
Cord.plugins._register = function(plugin, fnc) {
	// Copy all of the default config settings
	if(plugin.config) {
		for(var setting in plugin.config) {
			if(plugin.config.hasOwnProperty(setting) && !Cord.config.hasOwnProperty(setting))
				Cord.config[setting] = plugin.config[setting];
		}
	}
	// Push references to all of the callback methods
	for(var callback in Cord._callbacks) {
		if(Cord._callbacks.hasOwnProperty(callback) && typeof plugin[callback] === 'function')
			fnc.call(Cord._callbacks[callback], plugin[callback]);
	}
	// Register a variable scope
	if(plugin.scope)
		Cord._scopes[plugin.scope.namespace.toLowerCase()] = plugin.scope;
	return fnc.call(this, plugin);
};
Cord.plugins.unshift = function(plugin) {
	return this._register(plugin, Array.prototype.unshift);
};
Cord.plugins.push = function(plugin) {
	return this._register(plugin, Array.prototype.push);
};

// Do not externally modify the array or object returned from this method
// An empty array or object are returned when no observers exist
// key argument is optional
// create is also optional and if true will interally create the observer array or object as needed
View.prototype._getObservers = function(namespace, key, create) {
	var observers;
	// In some cases it is possible for observer functions to run after remove - just return empty
	if(this._observers === null)
		return key ? [] : {};
	namespace = namespace.toLowerCase();
	observers = this._observers[namespace];
	if(!observers) {
		observers = {};
		if(create)
			this._observers[namespace] = observers;
	}
	if(key) {
		if(!observers[key]) {
			if(create)
				observers = observers[key] = [];
			else
				observers = [];
		}
		else {
			observers = observers[key];
		}
	}
	return observers;
};
View.prototype._hasObservers = function(namespace, key) {
	var observers = this._getObservers(namespace, key);
	if(Array.isArray(observers))
		return !!observers.length;
	return !!Object.keys(observers).length;
};
View.prototype._addObserver = function(namespace, key, observer) {
	var observers = this._getObservers(namespace, key, true);
	observers.push(observer);
};
View.prototype._removeObserver = function(namespace, key, observer) {
	var observers = this._getObservers(namespace);
	if(observers[key]) {
		var index = observers[key].indexOf(observer);
		if(index !== -1) {
			observers[key].splice(index, 1);
			if(!observers[key].length)
				delete observers[key];
		}
	}
};
View.prototype._invokeObservers = function(namespace, key, value) {
	Cord.log(namespace, key, value);
	var i, observers = this._getObservers(namespace, key);
	for(i = 0; i < observers.length; ++i)
		observers[i].call(this, key, value);
	return this;
};
function _applyFilters(func, filters) {
	return function(key, value) {
		for(var i = 0; i < filters.length; ++i)
			value = filters[i](value);
		return func.call(this, key, value);
	};
}
function _applyNegation(func) {
	return function(key, value) {
		func.call(this, key, !Cord.convertToBool(value));
	};
}
function _applySubkeys(func, keys) {
	return function(key, value) {
		return func.call(this, key, _getObjValue(value, keys));
	};
}
View.prototype.observe = function(key, observer, immediate) {
	var path, namespace, scope;
	if(typeof observer === 'string')
		observer = this[observer] || _createSetValueCallback(observer);
	if(typeof observer !== 'function')
		return this;
	// If key starts with ! then apply a negation
	if(key[0] === '!') {
		key = key.substr(1);
		observer = _applyNegation(observer);
	}
	// Apply any filters to the observer function
	if(key.indexOf('|') !== -1) {
		var i, filters = [], names = key.split('|');
		key = names[0].trim();
		for(i = 1; i < names.length; ++i)
			filters.push(Cord.filters[names[i].trim()] || Math[names[i].trim()]);
		observer = _applyFilters(observer, filters);
	}
	// If key starts with %, just do an immediate timeout with the getValue
	// Doesn't include the key on callback since this is used only for binding straight to some output
	if(key[0] === '%') {
		key = key.substr(1);
		observer.call(this, null, this.getValueForKey.call(this, key));
		return this;
	}
	path = Cord.parseKeyPath(key);
	namespace = path[0];
	key = path[1];
	scope = Cord._scopes[namespace];
	// Support any subkeys but only changes to the top-level key are observed
	if(path.length > 2)
		observer = _applySubkeys(observer, path.slice(2));
	// Add the observer
	scope.observe.call(this, key, observer, immediate);
	this._addObserver(namespace, key, observer);
	if(immediate)
		observer.call(this, key, scope.getValue.call(this, key));
	return this;
};
View.prototype.unobserve = function(key, observer) {
	var path, namespace, scope;
	if(typeof observer === 'string')
		observer = this[observer];
	if(!observer)
		return this;
	path = Cord.parseKeyPath(key);
	namespace = path[0];
	key = path[1];
	scope = Cord._scopes[namespace];
	// Remove the observer
	this._removeObserver(namespace, key, observer);
	scope.unobserve.call(this, key, observer);
	return this;
};

// A simple event callback, where the last argument is taken as a value to pass into setValueForKey
function _createSetValueCallback(keyPath) {
	return function() {
		this.setValueForKey(keyPath, arguments[arguments.length - 1]);
	};
}
Cord.createSetValueCallback = _createSetValueCallback;
View.prototype.getValueForKey = function(keyPath) {
	var path, scope, value;
	path = Cord.parseKeyPath(keyPath);
	scope = Cord._scopes[path[0]];
	value = scope.getValue.call(this, path[1]);
	if(path.length > 2)
		value = _getObjValue(value, path.slice(2));
	return value;
};
View.prototype.setValueForKey = function(keyPath, value) {
	var path, scope;
	path = Cord.parseKeyPath(keyPath);
	scope = Cord._scopes[path[0]];
	// Use _setObjValue with subkeys, code is optimized with the first getValue, also valid is: _setObjValue(this, path, value);
	if(path.length > 2)
		_setObjValue(scope.getValue.call(this, path[1]), path.slice(2), value);
	else
		scope.setValue.call(this, path[1], value);
	return this;
};
View.prototype.setValuesForKeys = function(values) {
	var i, key;
	if(_isPlainObj(values)) {
		for(key in values) {
			if(values.hasOwnProperty(key))
				this.setValueForKey(key, values[key]);
		}
	} else {
		for(i = 0; (i + 1) < arguments.length; i += 2)
			this.setValueForKey(arguments[i], arguments[i + 1]);
	}
	return this;
};

// Built-in model scope that simply wraps access to the model, the model listening for observing is managed by setModel()
Cord._scopes.model = {
	observe: function(key, observer) {
		if(key === 'id')
			this._addObserver('model', this.model.idAttribute, observer);
	},
	unobserve: function(key, observer) {
		if(key === 'id')
			this._removeObserver('model', this.model.idAttribute, observer);
	},
	getValue: function(key) {
		if(key === 'id')
			return this.model.id;
		return this.model.get(key);
	},
	setValue: function(key, value) {
		if(key === 'id')
			key = this.model.idAttribute;
		this.model.set(key, value);
	}
};
// Built-in observer for all changes on the model
View.prototype._modelObserver = function(model, options) {
	var key, changed = options._changed || model.changedAttributes();
	if(!changed)
		return;
	for(key in changed) {
		if(changed.hasOwnProperty(key))
			this._invokeObservers('model', key, changed[key]);
	}
};
// setModel will change the model a View has and invoke any observers
// For best performance and results, models should normally be provided in the View's constructor - only use setModel to swap out an existing model
// A default empty model is provided so that Cord and plugins can always count on a model being available, making the logic a bit easier
// setModel is defined as a method and not a property because it would be too confusing to distinguish between the first set and later changes, this is more explicit
View.prototype.model = Cord.EmptyModel;
View.prototype.setModel = function(newModel, noCascade) {
	var key, current, subview, observers;
	if(this.model === newModel)
		return this;
	if(!newModel)
		newModel = Cord.EmptyModel;
	if(!(newModel instanceof Backbone.Model))
		throw new Error('Attempting to assign a non-Backbone.Model to View.model.');
	current = this.model;
	this.model = newModel;
	this.stopListening(current);
	this.listenTo(this.model, 'change', this._modelObserver);
	// Detect the changes and invoke observers
	observers = this._getObservers('model');
	if(Object.keys(observers).length) {
		// Invoke all observers if the model is the empty model
		if(this.model === Cord.EmptyModel) {
			for(key in observers) {
				if(observers.hasOwnProperty(key))
					this._invokeObservers('model', key, void(0));
			}
		}
		else {
			this._modelObserver(this.model, {_changed: current.changedAttributes(this.model.attributes)});
		}
	}
	if(!noCascade) {
		for(key in this.subviews) {
			if(this.subviews.hasOwnProperty(key)) {
				subview = this.subviews[key];
				// Do not cascade if the subview is not a Cord View or is intercepted by a cascade method
				if(!(subview instanceof View))
					continue;
				if(subview.cascade && subview.cascade(newModel) === false)
					continue;
				if(subview.model === current && !subview.collection)
					subview.setModel(newModel);
			}
		}
	}
	return this;
};

// setCollection provided as a convention for plugins to wrap
// NOTE: View.prototype.collection is set to EmptyCollection only in the collection mixin
View.prototype.setCollection = function(newCollection) {
	if(this.collection === newCollection)
		return this;
	if(!newCollection)
		newCollection = Cord.EmptyCollection;
	if(!(newCollection instanceof Backbone.Collection))
		throw new Error('Attempting to assign a non-Backbone.Collection to View.collection.');
	this.stopListening(this.collection);
	this.collection = newCollection;
	return this;
};

if(typeof exports === 'object')
	module.exports = Cord;

})(((typeof self === 'object' && self.self === self && self) || (typeof global === 'object' && global.global === global && global)));
