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
	VERSION: '1.0.23',

	// View, Model, and Collection
	View: View,
	Model: Model,
	Collection: Collection,

	// EmptyView, EmptyModel, and EmptyCollection to use as default model, subview placeholder, and fallback collection on setCollection(null)
	EmptyView: View.extend({ tagName: 'meta' }),
	EmptyModel: new (Model.extend({set: function() { return this; }, toString: function() { return ''; }}))(),
	EmptyCollection: new (Collection.extend({add: function() { return this; }, reset: function() { return this; }, set: function() { return this; }, toString: function() { return ''; }}))(),

	// Mixins installed by the app by setting keys on this object
	mixins: {},

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
		evt = document.createEvent('HTMLEvents');
		evt.initEvent('input', true, true);
		el.dispatchEvent(evt);
	},

	// Internally set readonly properties with the ForceValue object Backbone only
	ForceValue: function(value) { this.value = value; },

	// Conversion functions
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

	// Class attribute manipulation functions
	// Use get/set attribute because className doesn't work with svg elements
	// cls argument for add/remove can be a space separated string or an array of single class strings
	hasClass: function(el, cls) {
		return (el.getAttribute('class') || '').split(' ').indexOf(cls) !== -1;
	},
	addClass: function(el, cls) {
		if(!Array.isArray(cls))
			cls = cls.split(' ');
		for(var i = 0; i < cls.length; ++i) {
			if(!Cord.hasClass(el, cls[i]))
				el.setAttribute('class', ((el.getAttribute('class') || '') + ' ' + cls[i]).trim());
		}
	},
	removeClass: function(el, cls) {
		var i, clss = (el.getAttribute('class') || '').split(' ');
		if(!Array.isArray(cls))
			cls = cls.split(' ');
		for(i = clss.length - 1; i >= 0; --i) {
			if(cls.indexOf(clss[i]) !== -1)
				clss.splice(i, 1);
		}
		el.setAttribute('class', clss.join(' '));
	},

	// Unique internal subview id, this unifies how subviews with and without ids are stored
	scopes: {},

	// Override or wrap to provide different keyPath processing, different prefixes, or shorthands
	// The return value must be an array of the different key path components, with the first being the namespace normalized to lowercase
	parseKeyPath: function(keyPath) {
		var components;
		keyPath = keyPath.replace(/__/g, '.');
		components = keyPath.split('.');
		// Default to the view scope
		if(components.length === 1 || !Cord.scopes[components[0].toLowerCase()])
			components.unshift('this');
		else
			components[0] = components[0].toLowerCase();
		return components;
	},

	// Regular expressions
	// NOTE: Do not use the regex functions test/exec when the global flag is set because it is stateful (lastIndex). Instead use string methods search/match
	// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Regular_Expressions#Working_with_regular_expressions
	regex: {}
};

/******************* Interpolation regex *******************/

function _escapeRegExp(str) { return str.replace(/[\-\[\]\/\{\}\(\)\*\+\?\.\\\^\$\|]/g, '\\$&'); }
function _regexPropertyDescriptor(name) {
	var search = name + 'Search';
	var value = name + 'Value';
	name = '_' + name;
	return {
		get: function() { return this[name]; },
		set: function(format) {
			this[name] = format;
			this[search] = new RegExp(_escapeRegExp(format.prefix) + '.*?' + _escapeRegExp(format.suffix), 'g');
			this[value] = new RegExp(_escapeRegExp(format.prefix) + '\\s*(.*?)\\s*' + _escapeRegExp(format.suffix));
		}
	};
}
Object.defineProperties(Cord.regex, {
	variable: _regexPropertyDescriptor('variable'),
	conditional: _regexPropertyDescriptor('conditional')
});
// Regex patterns can be configured by setting prefix/suffix values through these properties
Cord.regex.variable = {prefix: '[', suffix: ']'};
Cord.regex.conditional = {prefix: '(', suffix: ')'};

/******************* Utilities *******************/

// Helper functions for mixing objects and prototypes
function _chain(f1, f2) { return function() { f1.apply(this, arguments); return f2.apply(this, arguments); }; }

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
		value = obj[key];
		if(_isPlainObj(value))
			value = _copyObj(value);
		copy[key] = value;
	}
	return copy;
}

// Copy attributes into the first object argument given a number of additional object arguments
function _extendObj(obj) {
	var i, key, other;
	for(i = 1; i < arguments.length; ++i) {
		other = arguments[i];
		for(key in other)
			obj[key] = other[key];
	}
	return obj;
}

// Copy attributes into the first object argument (assumed to be a prototype) given a number of additional object arguments
// Same as extendObj but detects functions and chains them together from last to first
function _extendProto(proto) {
	var i, key, other, value, otherValue;
	for(i = 1; i < arguments.length; ++i) {
		other = arguments[i];
		for(key in other) {
			value = proto[key];
			otherValue = other[key];
			if(typeof value === 'function' && typeof otherValue === 'function')
				proto[key] = _chain(otherValue, value);
			else
				proto[key] = other[key];
		}
	}
	return proto;
}

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

function _getFunctionArgs(func) {
	// Get all argument names for a function
	// Based on http://stackoverflow.com/questions/1007981/how-to-get-function-parameter-names-values-dynamically-from-javascript
	var str = func.toString();
	var args = str.slice(str.indexOf('(') + 1, str.indexOf(')')).match(/([^\s,]+)/g);
	if(!args)
		args = [];
	return args;
}

// Add object utility functions
_extendObj(Cord, {
	isPlainObj: _isPlainObj,
	copyObj: _copyObj,
	extendObj: _extendObj,
	extendProto: _extendProto,
	mixObj: _mixObj,
	getPrototypeValuesForKey: _getPrototypeValuesForKey,
	getFunctionArgs: _getFunctionArgs,
	log: (debug ? function() {
		var format = [];
		var args = Array.prototype.slice.call(arguments);
		for(var i = 0; i < args.length; ++i)
			format.push((typeof args[i] === 'object') ? '%O' : '%s');
		args.unshift(format.join(' | '));
		console.log.apply(console, args);
	} : function(){})
});

/******************* Data binding object extensions *******************/

// Internal use only for when there are one or more subkeys to resolve on an object, view, or model
function _getObjValue(obj, keys) {
	var i, key;
	keys = Array.isArray(keys) ? keys : keys.split('.');
	for(i = 0; i < keys.length; ++i) {
		key = keys[i];
		if(obj.getValueForKey) {
			// If a namespace is included in the keys pass the pair (which is still a single key) to getValueForKey
			if(Cord.scopes[key.toLowerCase()] && ((i + 1) < keys.length)) {
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

// A simple event callback, where the last argument is taken as a value to pass into setValueForKey
var _createSetValueCallback = Cord.createSetValueCallback = function(keyPath) {
	return function() {
		this.setValueForKey(keyPath, arguments[arguments.length - 1]);
	};
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

Cord.Binding = {
	// Do not externally modify the array or object returned from this method
	// An empty array or object are returned when no observers exist
	// key argument is optional
	// create is also optional and if true will interally create the observer array or object as needed
	_getObservers: function(namespace, key, create) {
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
	},

	_hasObservers: function(namespace, key) {
		var observers = this._getObservers(namespace, key);
		if(Array.isArray(observers))
			return !!observers.length;
		return !!Object.keys(observers).length;
	},

	_addObserver: function(namespace, key, observer) {
		var observers = this._getObservers(namespace, key, true);
		observers.push(observer);
	},

	_removeObserver: function(namespace, key, observer) {
		var observers = this._getObservers(namespace);
		if(observers[key]) {
			var index = observers[key].indexOf(observer);
			if(index !== -1) {
				observers[key].splice(index, 1);
				if(!observers[key].length)
					delete observers[key];
			}
		}
	},

	_invokeObservers: function(namespace, key, value) {
		Cord.log(namespace, key, value);
		var i, observers = this._getObservers(namespace, key);
		for(i = 0; i < observers.length; ++i)
			observers[i].call(this, key, value);
		return this;
	},

	observe: function(key, observer, immediate) {
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
		scope = Cord.scopes[namespace];
		// Support any subkeys but only changes to the top-level key are observed
		if(path.length > 2)
			observer = _applySubkeys(observer, path.slice(2));
		// Add the observer
		scope.observe.call(this, key, observer, immediate);
		this._addObserver(namespace, key, observer);
		if(immediate)
			observer.call(this, key, scope.getValue.call(this, key));
		return this;
	},

	unobserve: function(key, observer) {
		var path, namespace, scope;
		if(typeof observer === 'string')
			observer = this[observer];
		if(!observer)
			return this;
		path = Cord.parseKeyPath(key);
		namespace = path[0];
		key = path[1];
		scope = Cord.scopes[namespace];
		// Remove the observer
		this._removeObserver(namespace, key, observer);
		scope.unobserve.call(this, key, observer);
		return this;
	},

	stopObserving: function() {
		var namespace, scope;
		for(namespace in this._observers) {
			scope = Cord.scopes[namespace];
			if(scope.stop)
				scope.stop.call(this);
		}
		this._observers = null;
	},

	getValueForKey: function(keyPath) {
		var path, scope, value;
		path = Cord.parseKeyPath(keyPath);
		scope = Cord.scopes[path[0]];
		value = scope.getValue.call(this, path[1]);
		if(path.length > 2)
			value = _getObjValue(value, path.slice(2));
		return value;
	},

	setValueForKey: function(keyPath, value) {
		var path, scope;
		path = Cord.parseKeyPath(keyPath);
		scope = Cord.scopes[path[0]];
		// Use _setObjValue with subkeys, code is optimized with the first getValue, also valid is: _setObjValue(this, path, value);
		if(path.length > 2)
			_setObjValue(scope.getValue.call(this, path[1]), path.slice(2), value);
		else
			scope.setValue.call(this, path[1], value);
		return this;
	},

	setValuesForKeys: function(values) {
		var i, key;
		if(_isPlainObj(values)) {
			for(key in values)
				this.setValueForKey(key, values[key]);
		}
		else {
			for(i = 0; (i + 1) < arguments.length; i += 2)
				this.setValueForKey(arguments[i], arguments[i + 1]);
		}
		return this;
	},

	// A default empty model is provided so that Cord and plugins can always count on a model being available, making the logic a bit easier
	model: Cord.EmptyModel,

	// Built-in observer for all changes on the model
	_modelObserver: function(model, options) {
		var key, changed = options._changed || model.changedAttributes();
		if(!changed)
			return;
		for(key in changed)
			this._invokeObservers('model', key, changed[key]);
	},

	// setModel will change the model a View has and invoke any observers
	// For best performance and results, models should normally be provided in the View's constructor - only use setModel to swap out an existing model
	// setModel is defined as a method and not a property because it would be too confusing to distinguish between the first set and later changes, this is more explicit
	setModel: function(newModel) {
		var key, current, observers;
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
				for(key in observers)
					this._invokeObservers('model', key, void(0));
			}
			else {
				this._modelObserver(this.model, {_changed: current.changedAttributes(this.model.attributes)});
			}
		}
		return this;
	},

	// setCollection provided as a convention for plugins to wrap
	// NOTE: View.prototype.collection is set to EmptyCollection only in the collection mixin
	setCollection: function(newCollection) {
		if(this.collection === newCollection)
			return this;
		if(!newCollection)
			newCollection = Cord.EmptyCollection;
		if(!(newCollection instanceof Backbone.Collection))
			throw new Error('Attempting to assign a non-Backbone.Collection to View.collection.');
		this.stopListening(this.collection);
		this.collection = newCollection;
		return this;
	}
};

// Extend the View class with binding capabilities
_extendObj(View.prototype, Cord.Binding);

// Built-in model scope that simply wraps access to the model, the model listening for observing is managed by setModel()
Cord.scopes.model = {
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

if(typeof exports === 'object')
	module.exports = Cord;

})(((typeof self === 'object' && self.self === self && self) || (typeof global === 'object' && global.global === global && global)));

;(function(root) {
'use strict';

var Backbone = root.Backbone || require('backbone');
var Cord = Backbone.Cord;
var extendObj = Cord.extendObj;
var isPlainObj = Cord.isPlainObj;
var extendProto = Cord.extendProto;
var ForceValue = Cord.ForceValue;

var convertToString = Cord.convertToString;
var encodeValue = Cord.encodeValue;
var decodeValue = Cord.decodeValue;
var randomGUID = Cord.randomGUID;
var setImmediate = Cord.setImmediate;
var regex = Cord.regex;

var react = root.preact || root.react || require('preact') || require('react');
var Component = react.Component;
var options = react.options;
var __setState = Component.prototype.setState;

var _currentComponent = null;
var _currentBinding = null;
var _DATA_BINDING_ATTR = 'data-binding-guid';
var _DATA_FEEDBACK_ATTR = 'data-binding-feedback';

function _bindGUID(uid, proxy) {
	var guid = null;
	if(uid && _currentComponent) {
		guid = _currentComponent._boundGUIDs[uid] || (_currentComponent._boundGUIDs[uid] = randomGUID());
		_currentComponent._boundGUIDProxies[guid] = proxy;
	}
	return guid;
}

var bind = Cord.bind = function(key, guid) {
	if(!_currentComponent)
		return;
	var boundKey = guid || key;
	if(!_currentComponent._boundKeys[boundKey]) {
		_currentComponent.observe(key, function(key, value) {
			// Don't this.forceUpdate() because it is synchronous, instead call setState with no updates to enqueue a rerender
			if(guid && this._boundGUIDProxies[guid])
				this._boundGUIDProxies[guid].call(this, guid, key, value);
			else
				__setState.call(this, {});
		});
		_currentComponent._boundKeys[boundKey] = true;
	}
	return _currentComponent.getValueForKey(key);
};

var computed = Cord.computed = function(func) {
	var args = Cord.getFunctionArgs(func);
	if(!args.length)
		return func;
	var compFunc = function(compKey) {
		var i, values = [], state = {};
		compKey = compKey.split('@')[0];
		for(i = 0; i < args.length; ++i)
			values.push(this.getValueForKey(args[i]));
		state[compKey] = func.apply(this, values);
		this.setState(state);
	};
	compFunc._args = args;
	compFunc._computed = true;
	return compFunc;
};

// Add the default scope and have it mirror this.state
Cord.scopes.this = {
	observe: function() {},
	unobserve: function() {},
	getValue: function(key) {
		return this.state[key];
	},
	setValue: function(key, value) {
		var change = {};
		// For compatibility for some older mixins with readonly BB properties
		if(typeof value === 'object' && Object.getPrototypeOf(value) === ForceValue.prototype)
			value = value.value;
		change[key] = value;
		this.setState(change);
	}
};

function _normalizeMixin(mixin) {
	var methods = {};
	var state = {};
	var attr, value;
	var lifecycleMap = {
		initialize: 'componentWillMount',
		remove: 'componentWillUnmount'
	};
	if(mixin.properties) {
		for(attr in mixin.properties) {
			value = mixin.properties[attr];
			if(typeof value === 'function')
				state[attr] = computed(value);
			else if(isPlainObj(value))
				state[attr] = value.get ? computed(value.get) : value.value;
			else state[attr] = value;
		}
	}
	for(attr in mixin) {
		value = mixin[attr];
		if(typeof value === 'function')
			methods[(lifecycleMap[attr] || attr)] = value;
	}
	mixin.methods = methods;
	mixin.state = state;
	mixin._normalized = true;
}

// Inherit from react's Component so render can be wrapped and mixins applied
Cord.Component = function(props) {
	Component.apply(this, arguments);

	// Init observers
	this._observers = {};

	// Keys is true/false is a bound key is used in the render pipeline
	// GUIDs is mapping of vnode uids to GUIDs
	// Proxies maps GUIDs to a callback function
	this._boundKeys = {};
	this._boundGUIDs = {};
	this._boundGUIDProxies = {};

	// Apply any mixins
	var proto = Object.getPrototypeOf(this);
	if(proto.mixins && !proto._mixinsApplied) {
		var i, mixin, state = {};
		for(i = 0; i < proto.mixins.length; ++i) {
			mixin = Cord.mixins[proto.mixins[i]];
			if(!mixin._normalized)
				_normalizeMixin(mixin);
			extendProto(proto, mixin.methods);
			extendObj(state, mixin.state);
		}
		proto._mixinState = state;
		proto._mixinsApplied = true;
	}

	// Wrap render, componentDidMount, and componentDidUpdate to allow bind() function to work without a context
	// Wrapping just render is not enough because child vnodes that are functions are not called until after render
	var __render = this.render;
	var __componentDidMount = this.componentDidMount;
	var __componentDidUpdate = this.componentDidUpdate;
	this.render = function() {
		var ret;
		this._prevComponent = _currentComponent;
		_currentComponent = this;
		try {
			ret = __render.apply(this, arguments);
		}
		catch(err) {
			_currentComponent = this._prevComponent;
			throw err;
		}
		return ret;
	};
	this.componentDidMount = function() {
		_currentComponent = this._prevComponent;
		if(__componentDidMount)
			__componentDidMount.apply(this, arguments);
	};
	this.componentDidUpdate = function() {
		_currentComponent = this._prevComponent;
		if(__componentDidUpdate)
			__componentDidUpdate.apply(this, arguments);
	};

	var __componentWillMount = this.componentWillMount;
	this.componentWillMount = function() {
		var i, attr, args, value, prevComponent, guid, state = this.state;
		// Initialize computed state and any initial state from mixins
		if(this._mixinState)
			extendObj(state, this._mixinState);
		for(attr in state) {
			value = state[attr];
			if(typeof value === 'function' && value._computed) {
				args = value._args;
				prevComponent = _currentComponent;
				_currentComponent = this;
				try {
					for(i = 0; i < args.length; ++i) {
						// Setup as proxy setting the name of the (property @ arg number) as the guid for each bound argument
						guid = attr + '@' + i;
						this._boundGUIDProxies[guid] = value;
						bind(args[i], guid);
					}
					// Run once to set the initial state
					value.call(this, attr);
				}
				finally {
					_currentComponent = prevComponent;
				}
			}
		}
		if(__componentWillMount)
			__componentWillMount.apply(this, arguments);
	};

	// Wrap componentWillReceiveProps to automatically check for model and collection updates as props
	var __componentWillReceiveProps = this.componentWillReceiveProps;
	this.componentWillReceiveProps = function(props) {
		if(props.model)
			this.setModel(props.model);
		if(props.collection)
			this.setCollection(props.collection);
		if(__componentWillReceiveProps)
			__componentWillReceiveProps.apply(this, arguments);
	};
	// Set the initial model or collection
	if(props.model)
		this.setModel(props.model);
	if(props.collection)
		this.setCollection(props.collection);
};
Cord.Component.prototype = Object.create(Component.prototype);
Cord.Component.prototype.constructor = Cord.Component;

// Extend Component with data binding methods without backwards compatibility Event functions (bind/unbind)
extendObj(Cord.Component.prototype, Cord.Binding, Backbone.Events);
delete Cord.Component.prototype.bind;
delete Cord.Component.prototype.unbind;

Cord.Component.prototype.setState = function(state, callback) {
	if(typeof state === 'function')
		state = state(this.state, this.props);
	for(var key in state) {
		if(this._hasObservers('this', key))
			this._invokeObservers('this', key, state[key]);
	}
	__setState.call(this, state, callback);
};

// Wrap setCollection to rerender on a new collection
var __setCollection = Cord.Component.prototype.setCollection;
Cord.Component.prototype.setCollection = function(newCollection) {
	if(this.collection === newCollection)
		return this;
	__setCollection.apply(this, arguments);
	var rerender = function() {
		__setState.call(this, {length: this.collection.length});
	};
	this.listenTo(newCollection, 'add', rerender);
	this.listenTo(newCollection, 'remove', rerender);
	this.listenTo(newCollection, 'sort', rerender);
	this.listenTo(newCollection, 'reset', rerender);
	rerender.call(this);
};

// Cleanup code for all components
var __beforeUnmount = options.beforeUnmount;
options.beforeUnmount = function(component) {
	// Observer cleanup
	if(component.stopObserving)
		component.stopObserving();
	// BB event cleanup
	if(component.stopListening)
		component.stopListening();
	if(__beforeUnmount)
		__beforeUnmount.apply(this, arguments);
};

function _testBindingFeedback(el) {
	// Prevent two-way data binding from creating an infinite feedback loop through dispatching events
	if(!el.hasAttribute(_DATA_FEEDBACK_ATTR))
		return false;
	var bindingUid = el.getAttribute(_DATA_BINDING_ATTR);
	if(bindingUid && bindingUid === _currentBinding) {
		_currentBinding = null;
		return true;
	}
	else {
		_currentBinding = bindingUid;
		return false;
	}
}

function _bindingProxy(guid, key, value) {
	var el = document.body.querySelector('[' + _DATA_BINDING_ATTR + '="' + guid + '"]');
	if(!el || _testBindingFeedback(el))
		return;
	encodeValue(el, value);
}

function _createValueListener(key, wrapped) {
	return function(e) {
		var el = e.currentTarget;
		if(_testBindingFeedback(el))
			return;
		this.setValueForKey(key, decodeValue(el));
		if(wrapped)
			wrapped(e);
	}.bind(_currentComponent);
}

var __vnode = options.vnode;
options.vnode = function(vnode) {
	// vnode contains: nodeName, children (one item or array), attributes, key
	var i, j, child, strings, matches, spliceArgs;
	var children = Array.isArray(vnode.children) ? vnode.children : [vnode.children];
	var attrs = vnode.attributes || {};

	if(!attrs.raw) {
		for(i = children.length - 1; i >= 0; --i) {
			child = children[i];
			if(typeof child === 'string') {
				strings = child.split(regex.variableSearch);
				if(strings.length > 1) {
					spliceArgs = [i, 1];
					matches = child.match(regex.variableSearch);
					for(j = 0; j < matches.length; ++j) {
						if(strings[j].length)
							spliceArgs.push(strings[j]);
						// Force to a string because it is what preact expects
						spliceArgs.push(convertToString(bind(regex.variableValue.exec(matches[j])[1])));
					}
					if(strings[j].length)
						spliceArgs.push(strings[j]);
					Array.prototype.splice.apply(children, spliceArgs);
				}
			}
		}
		vnode.children = children;
	}

	// The attr bind is shorthand for both observe and change
	if(attrs.bind) {
		attrs.observe = attrs.bind;
		attrs.change = attrs.bind;
		delete attrs.bind;
	}

	if(attrs.observe || attrs.change || attrs.input) {
		var guid = _bindGUID(vnode.key || attrs.name, _bindingProxy);

		if(!guid) {
			delete attrs.observe;
			delete attrs.change;
			delete attrs.input;
		}
		else {
			attrs[_DATA_BINDING_ATTR] = guid;

			// Observer binding to set the value
			if(attrs.observe) {
				var value = bind(attrs.observe, guid);
				delete attrs.observe;
				// Set the initial value on a delayed callback
				setImmediate(_bindingProxy.bind(null, guid, null, value));
				// If two-way this element is sensitive to binding feedback
				if(attrs.observe === attrs.change || attrs.observe === attrs.input)
					attrs[_DATA_FEEDBACK_ATTR] = true;
			}

			// Reverse binding on change or input events to listen to changes in the value
			if(attrs.change) {
				attrs.onChange = _createValueListener(attrs.change, attrs.onChange || attrs.onchange);
				delete attrs.change;
			}
			if(attrs.input) {
				attrs.onInput = _createValueListener(attrs.input, attrs.onInput || attrs.oninput);
				delete attrs.input;
			}
		}
	}

	if(__vnode)
		__vnode.apply(this, arguments);
};

if(typeof exports === 'object')
	module.exports = Cord;

})(((typeof self === 'object' && self.self === self && self) || (typeof global === 'object' && global.global === global && global)));

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
Model.extend = function(properties) {
	var __initialize;
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
	return __extend.apply(this, arguments);
};

})(((typeof self === 'object' && self.self === self && self) || (typeof global === 'object' && global.global === global && global)).Backbone || require('backbone'));

;(function(Backbone) {
'use strict';

var Cord = Backbone.Cord;
var mixObj = Cord.mixObj;

var namedPart = /(\(\?)?:\w+/g;
var splatPart = /\*\w+/g;
var normalPart = /\w+/g;

Cord.Router = Backbone.Router.extend({
	route: function(route, name, callback)  {
		var i, match, part, parts = route.split('/');
		var key = this.key;
		var components = {};
		var params = {};
		for(i = 0; i < parts.length; ++i) {
			part = parts[i];
			if(!part.length)
				continue;
			match = part.match(namedPart) || part.match(splatPart);
			if(match) {
				params[i] = match[0].substr(1);
			}
			else {
				match = part.match(normalPart);
				if(match) {
					components[key] = match[0];
					key = 'sub' + key;
				}
			}
		}
		if(typeof name === 'function') {
			callback = name;
			name = '';
		}
		return Backbone.Router.prototype.route.call(this, route, name, this.wrapCallback(name, callback, components, params));
	},
	wrapCallback: function(name, callback, components, params) {
		// components is a mapping of keys: component values, params is a mapping of argument index positions (0, 1, 2 etc.) to key names
		return function() {
			var i, values = {};
			var model = Cord.UnmanagedScopes.route;
			var existingKeys = Object.keys(model.attributes);
			// null all current values
			for(i = 0; i < existingKeys.length; ++i)
				values[existingKeys[i]] = null;
			// set the name of the current route
			values.name = name || '';
			// add in the named params of the route - unmatched params are null, also appears last argument is also null
			for(i = 0; i < arguments.length; ++i) {
				if(arguments[i] !== null)
					values[params[i]] = arguments[i];
			}
			// add in the components of the path
			values = mixObj(values, components);
			// invoke observers by setting the model and then do the callback if provided
			model.set(values);
			if(callback)
				return callback.apply(this, arguments);
		};
	}
});

})(((typeof self === 'object' && self.self === self && self) || (typeof global === 'object' && global.global === global && global)).Backbone || require('backbone'));

;(function(Backbone) {
'use strict';

var Cord = Backbone.Cord;
var Model = Cord.Model;
var Collection = Cord.Collection;
var ForceValue = Cord.ForceValue;

// Default parseError method, Simply read the http status
Cord.parseError = Cord.parseError || function(response) {
	return response.status;
};

function _setValues(progress, syncing, error, modelCollection, response, options) {
	error = error && Cord.parseError(response, options);
	if(this.setValueForKey) {
		this.setValueForKey('syncProgress', new ForceValue(progress));
		this.setValueForKey('syncing', new ForceValue(syncing));
		this.setValueForKey('syncError', new ForceValue(error));
	}
	else {
		this.syncProgress = progress;
		this.syncing = syncing;
		this.syncError = error;
	}
}

// Notes on events:
// request (when fetch starts)
// sync (when sync has finished successfully, fetch, save, and destroy)
// error (when a sync error occurs)
function _addListeners(modelCollection) {
	this.listenTo(modelCollection, 'request', _setValues.bind(this, 0.0, true, null));
	this.listenTo(modelCollection, 'sync', _setValues.bind(this, 1.0, false, null));
	this.listenTo(modelCollection, 'error', _setValues.bind(this, 1.0, false, true));
}

function _onProgress(evt) {
	if(evt.lengthComputable) {
		var progress = evt.loaded / evt.total;
		if(this.setValueForKey)
			this.setValueForKey('syncProgress', new ForceValue(progress));
		else
			this.syncProgress = progress;
	}
}

function _startSync(method, model, options) {
	if(!this.__syncListening) {
		this.__syncListening = true;
		_addListeners.call(this, this);
	}
	// Progress event must be added only through the xhr factory since the jqXHR object after ajax() and beforeSend() etc. doesn't have access to the actual XHR
	var __xhr = options.xhr || (Backbone.$.ajaxSettings && Backbone.$.ajaxSettings.xhr) || function() { return new window.XMLHttpRequest(); };
	var onprogress = _onProgress.bind(this);
	options.xhr = function() {
		var xhr = __xhr();
		xhr.addEventListener('progress', onprogress);
		xhr.upload.addEventListener('progress', onprogress);
		return xhr;
	};
}

// Wrap the sync method to detect when a request is taking place, only done in case a sync starts before being given to a View
// Apply listeners only once
var __modelSync = Model.prototype.sync;
Model.prototype.sync = function() {
	_startSync.apply(this, arguments);
	return __modelSync.apply(this, arguments);
};
var __collectionSync = Collection.prototype.sync;
Collection.prototype.sync = function() {
	_startSync.apply(this, arguments);
	return __collectionSync.apply(this, arguments);
};

Cord.mixins.syncing = {
	properties: {
		syncing: {
			value: false,
			readonly: true
		},
		syncProgress: {
			value: 0.0,
			readonly: true
		},
		syncError: {
			value: null,
			readonly: true
		}
	},
	_initSyncingProperties: function(modelCollection) {
		if(modelCollection) {
			this.setValueForKey('syncing', new ForceValue(modelCollection.syncing));
			this.setValueForKey('syncProgress', new ForceValue(modelCollection.syncProgress));
			this.setValueForKey('syncError', new ForceValue(modelCollection.syncError));
			_addListeners.call(this, modelCollection);
		}
	},
	setModel: function(model) {
		this._initSyncingProperties(model);
	},
	setCollection: function(collection) {
		this._initSyncingProperties(collection);
	}
};

})(((typeof self === 'object' && self.self === self && self) || (typeof global === 'object' && global.global === global && global)).Backbone || require('backbone'));

;(function(Backbone) {
'use strict';

var Cord = Backbone.Cord;
var Model = Cord.Model;
var EmptyModel = Cord.EmptyModel;
var ForceValue = Cord.ForceValue;

var _formats = {
	url: /^(https?:\/\/(?:www\.|(?!www))[^\s\.]+\.[^\s]{2,}|www\.[^\s]+\.[^\s]{2,})/i,
	ip: /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/i,
	email: /^[a-z0-9!#$%&'*+\/=?^_`{|}~.-]+@[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$/i,
	slug: /^[a-z0-9-]+$/i,
	username: /^[a-z0-9_@\-\+\.]{3,150}$/i,
	color: /^#?([a-f0-9]{6}|[a-f0-9]{3})$/i
};

Cord.Validation = {
	formats: _formats
};

Cord.scopes.errors = {
	namespace: 'errors',
	observe: function() {},
	unobserve: function() {},
	getValue: function(key) { return this.errors.get(key); },
	setValue: function() {}
};

Cord.validate = function(value, rule) {
	var i, format, formats, type = rule.type.split(' ')[0];
	if(value === null || (value === '' && rule.type === 'string'))
		return rule.required ? 'required' : true;
	if((type === 'string' && typeof(value) !== 'string') ||
		(type === 'date' && !(value instanceof Date)) ||
		(type === 'int' && !(+value === value && (value % 1) === 0)) ||
		(type === 'float' && typeof(value) !== 'number') ||
		(type === 'bool' && typeof(value) !== 'boolean') ||
		(type === 'array' && !Array.isArray(value)) ||
		(type === 'model' && !(value instanceof Model))
	)
			return 'type';
	if(rule.equals !== null && rule.equals !== void(0)) {
		if(Array.isArray(rule.equals)) {
			if(rule.equals.indexOf(value) === -1)
				return 'equals';
		}
		else if(typeof(rule.equals) === 'object') {
			if(rule.equals[value] === void(0))
				return 'equals';
		}
		else if(value !== rule.equals) {
			return 'equals';
		}
	}
	else {
		if(rule.type === 'string') {
			if(rule.min && value.length < rule.min)
				return 'min';
			if(rule.max && value.length > rule.max)
				return 'max';
			if(rule.format) {
				formats = Array.isArray(rule.format) ? rule.format : [rule.format];
				for(i = 0; i < formats.length; ++i) {
					format = formats[i];
					if(typeof(format) === 'string')
						format = _formats[format];
					if((typeof(format) === 'function' && !format(value)) ||
						(format instanceof RegExp && !format.test(value))
					)
						return 'format';
				}
			}
		}
		else {
			if(rule.min && value < rule.min)
				return 'min';
			if(rule.max && value > rule.max)
				return 'max';
		}
	}
	return true;
};

Cord.parseValidationError = function(value, rule, error, title) {
	// Override to provide custom error messages based on error strings
	var len = rule.type === 'string' ? 'The length of ' : '';
	var chars = rule.type === 'string' ? ' characters' : '';
	switch(error) {
		case 'required':
			return title + ' is required';
		case 'min':
			return len + title + ' must be greater than or equal to ' + rule.min + chars;
		case 'max':
			return len + title + ' must be less than or equal to ' + rule.max + chars;
		case 'format':
			if(typeof rule.format === 'string')
				return title + ' is not a valid ' + rule.format;
			break;
		default:
			break;
	}
	return title + ' is not valid';
};

Cord.mixins.validation = {
	errors: EmptyModel,
	properties: {
		allErrors: { readonly: true },
		latestError: { readonly: true },
		isValid: function(allErrors) { return !allErrors || !allErrors.length; }
	},
	events: {
		'submit form': 'validateForm'
	},
	initialize: function() {
		this.errors = new Model();
		this.listenTo(this.errors, 'change', function(model) {
			var key, changed = model.changedAttributes();
			if(!changed)
				return;
			for(key in changed)
				this._invokeObservers('errors', key, changed[key]);
		});
		this._addInvalidListener(this.model);
	},
	setModel: function(newModel) {
		this._addInvalidListener(newModel);
	},
	validateForm: function(e) {
		if(this.model.isValid()) {
			this._onValid(this.model, []);
			return true;
		}
		else {
			if(e) {
				e.preventDefault();
				e.stopPropagation();
			}
			return false;
		}
	},
	_addInvalidListener: function(model) {
		if(model !== EmptyModel)
			this.listenTo(model, 'invalid', this._onInvalid);
	},
	_onInvalid: function(model, validationErrors) {
		var attr, errors, allErrors, latestError, changed;

		for(attr in validationErrors) {
			// Convert all validationErrors to error messages
			if(validationErrors[attr] === 'format' && this.model.instructions && this.model.instructions[attr])
				latestError = this.model.instructions[attr];
			else
				latestError = Cord.parseValidationError(this.model.get(attr), this.model.rules[attr], validationErrors[attr], this.model.titles[attr] || 'This field', attr);
			this.errors.set(attr, latestError);
		}
		changed = this.model.changedAttributes();
		for(attr in changed) {
			// Anything in the changedAttributes but not in the validationErrors should be cleared
			if(!validationErrors[attr])
				this.errors.unset(attr);
		}
		allErrors = [];
		errors = this.errors.attributes;
		for(attr in errors)
			allErrors.push(errors[attr]);
		this.setValueForKey('allErrors', new ForceValue(allErrors));
		this.setValueForKey('latestError', new ForceValue(latestError));

	},
	_onValid: function() {
		// Use code within _onInvalid to clear previous error messages
		this._onInvalid(this.model, {});
	}
};

Cord.mixins.validateOnBlur = {
	initialize: function() {
		this._addBlurListener(this.model);
	},
	setModel: function(newModel) {
		this._addBlurListener(newModel);
	},
	_addBlurListener: function(model) {
		if(model !== EmptyModel) {
			model.listen('change', function() {
				if(this.model.validate(this.model.changedAttributes()))
					this._onValid(this.model, []);
			});
		}
	}
};

Model.prototype.validate = function(attributes) {
	var attr, rule, ret, errors = {};
	for(attr in attributes) {
		rule = this.rules[attr];
		if(rule) {
			if(rule.equals === null && rule.equals === void(0))
				rule.equals = this.choices && this.choices[attr];
			ret = Cord.validate(attributes[attr], rule);
			if(ret !== true)
				errors[attr] = ret;
		}
	}
	// Custom validation can also add to the errors object
	if(this.extendedValidate)
		this.extendedValidate(errors);
	if(Object.keys(errors).length)
		return errors;
};

})(((typeof self === 'object' && self.self === self && self) || (typeof global === 'object' && global.global === global && global)).Backbone || require('backbone'));

;(function(Backbone) {
'use strict';

var Cord = Backbone.Cord;
var Model = Backbone.Model;
var scopes = Cord.scopes;

function _createSharedScope(namespace, model) {
	var _modelObserver = function(model) {
		var key, changed = model.changedAttributes();
		if(!changed)
			return;
		for(key in changed)
			this._invokeObservers(namespace, key, changed[key]);
	};
	// NOTE: Final cleanup is automatic on remove() when backbone calls stopListening()
	return {
		namespace: namespace,
		model: model,
		observe: function() {
			if(!this._hasObservers(namespace))
				this.listenTo(model, 'change', _modelObserver);
		},
		unobserve: function() {
			if(!this._hasObservers(namespace))
				this.stopListening(model, 'change', _modelObserver);
		},
		getValue: function(key) {
			return model.get(key);
		},
		setValue: function(key, value) {
			model.set(key, value);
		}
	};
}

Cord.SharedScopes = {
	// Does not support setting an already created namespace
	set: function(namespace, model) {
		namespace = namespace.toLowerCase();
		if(scopes[namespace])
			throw new Error('Attempting to override an existing scope.');
		scopes[namespace] = _createSharedScope(namespace, model);
		this[namespace] = model;
	}
};

// Create standard unmanaged scopes for global shared and route
Cord.SharedScopes.set('shared', new Model());
Cord.SharedScopes.set('route', new Model());

})(((typeof self === 'object' && self.self === self && self) || (typeof global === 'object' && global.global === global && global)).Backbone || require('backbone'));
