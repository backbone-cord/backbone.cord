;(function(root) {
'use strict';

var Backbone = root.Backbone || require('backbone');
var compatibilityMode = root.cordCompatibilityMode;
var debug = root.cordDebug;

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
		if(obj instanceof Backbone.Cord.View) {
			// If a namespace is included in the keys pass the pair (which is still a single key) to getValueForKey
			if(Backbone.Cord._scopes[key.toLowerCase()] && ((i + 1) < keys.length)) {
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
				obj = Backbone.Cord.decodeValue(obj);
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
	if(obj instanceof Backbone.Cord.View) {
		obj.setValueForKey(key, value);
	}
	else if(obj instanceof Backbone.Model) {
		obj.set((key === 'id' ? obj.idAttribute : key), value);
	}
	else if(obj) {
		if(key === 'value' && obj.nodeType === Node.ELEMENT_NODE)
			Backbone.Cord.encodeValue(obj, value);
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
// Register mixins with Backbone.Cord.mixins
function _mixObj(obj) {
	var i, key, value, other, otherValue;
	if(typeof obj === 'string')
		obj = Backbone.Cord.mixins[obj] || {};
	obj = _copyObj(obj);
	for(i = 1; i < arguments.length; ++i) {
		other = arguments[i];
		if(typeof other === 'string')
			other = Backbone.Cord.mixins[other] || {};
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
		terminal = Backbone.Cord.mixins[terminal] || {};
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

function _callPlugins(name, context) {
	// For each callbacks, call and return false if false is returned
	// Context object to communicate data between plugins and callbacks
	var callbacks = Backbone.Cord._callbacks[name];
	var args = Array.prototype.slice.call(arguments, 1);
	delete context[name];
	for(var i = 0; i < callbacks.length; ++i) {
		context[name] = callbacks[i].apply(this, args) || context[name];
	}
	return context[name];
}

// Generate an arbitrary DOM node given a tag[id][classes] string, [attributes] dictionary, and [child nodes...]
// If #id is given it must appear before the .classes, e.g. #id.class1.class2 or span#id.class1.class2
function _createElement(tagIdClasses, attrs) {
	if(Backbone.Cord._viewContext && this !== Backbone.Cord._viewContext)
		return _createElement.apply(Backbone.Cord._viewContext, arguments);
	if(typeof tagIdClasses !== 'string') {
		var component = tagIdClasses;
		// A function with an extend method will be a Backbone view
		if(typeof component === 'function' && !(component.prototype instanceof Backbone.View)) {
			var args = Array.prototype.slice.call(arguments, 1);
			// When attrs (args[0]) is null, is a child, else just copy
			if(!args[0])
				args[0] = {};
			else if(!_isPlainObj(args[0]))
				args.unshift({});
			else
				args[0] = _copyObj(args[0]);
			args[0].children = (args.length > 2) ? args.slice(1) : args[1];
			if(Backbone.Cord.config.prefixCreateElement)
				args.unshift(this._createElement);
			return component.apply(this, args);
		}
		else {
			return _createSubview.apply(this, arguments).el;
		}
	}
	tagIdClasses = tagIdClasses.split('.');
	var context = { isView: this instanceof Backbone.Cord.View };
	var tagId = tagIdClasses[0].split('#');
	var tag = tagId[0] || 'div';
	var el = context.el = this._callPlugins('tag', context, tag) || document.createElement(tag);
	var id = context.id = tagId[1] || (attrs && attrs.id);
	if(id)
		Backbone.Cord.setId(el, id, this.vuid);
	var classes = tagIdClasses.slice(1);
	if(!classes.length && (attrs && attrs.className))
		classes = attrs.className.split(' ');
	Backbone.Cord.addClass(el, this._callPlugins('classes', context, classes) || classes);
	if(arguments.length > 1) {
		// If attrs is not the start of children, then apply the dictionary as attributes
		var i = 1;
		if(!(typeof attrs === 'string' || attrs instanceof Backbone.View || attrs instanceof Node)) {
			i = 2;
			// Copy attrs to prevent side-effects
			attrs = _copyObj(attrs);
			delete attrs.id; delete attrs.className;
			if(attrs.htmlFor) {
				attrs['for'] = attrs.htmlFor;
				delete attrs.htmlFor;
			}
			attrs = this._callPlugins('attrs', context, attrs) || attrs;
			for(var attr in attrs) {
				if(attrs.hasOwnProperty(attr))
					el.setAttribute(attr, attrs[attr]);
			}
		}
		// Copy arguments to prevent side-effects
		var child, children = Array.prototype.slice.call(arguments, i);
		if(Array.isArray(children[0]))
			children = children[0];
		children = this._callPlugins('children', context, children) || children;
		for(i = 0; i < children.length; ++i) {
			child = children[i];
			if(typeof child === 'string')
				el.appendChild(document.createTextNode(child));
			else if(child instanceof Backbone.View)
				el.appendChild(child.el);
			else
				el.appendChild(child);
		}
	}
	if(Backbone.Cord.config.idProperties && context.isView && id && Backbone.Cord.regex.testIdProperty(id)) {
		Object.defineProperty(this, id, {
			get: function() { return this.getChildById(id); },
			enumerable: true,
			configurable: false
		});
	}
	return this._callPlugins('complete', context) || el;
}

// id and classes on the subview are maintained, but recommended that id is set by the parent view
function _createSubview(instanceClass, bindings, keyValues) {
	var id, classes, subview, context, callback;
	if(!(instanceClass instanceof Backbone.View))
		subview = new instanceClass();
	else
		subview = instanceClass;
	// Set the subview's model
	if(this.model !== Backbone.Cord.EmptyModel && subview.model === Backbone.Cord.EmptyModel && !subview.collection && subview instanceof Backbone.Cord.View) {
		if(!subview.cascade || subview.cascade(this.model) !== false)
			subview.setModel(this.model);
	}
	// Create the plugin context - isView should always be true, this method should never be called any other way
	context = { el: subview.el, isView: this instanceof Backbone.Cord.View, subview: subview };
	if(!context.isView)
		throw new Error('Attempting to create a subview without a parent.');
	if(bindings) {
		id = context.id = bindings.id;
		if(id && !Backbone.Cord.hasId(subview.el))
			Backbone.Cord.setId(subview.el, id, this.vuid);
		if(bindings.className) {
			classes = bindings.className.split(' ');
			Backbone.Cord.addClass(subview.el, this._callPlugins('classes', context, classes) || classes);
		}
		// Copy bindings to prevent side-effects
		bindings = _copyObj(bindings);
		delete bindings.id; delete bindings.className;
		bindings = this._callPlugins('bindings', context, bindings) || bindings;
		for(var e in bindings) {
			if(bindings.hasOwnProperty(e)) {
				callback = (typeof bindings[e] === 'string') ? (this[bindings[e]] || _createSetValueCallback(bindings[e])) : bindings[e];
				if(typeof callback === 'function') {
					if(subview.properties && subview.properties.hasOwnProperty(e))
						subview.observe(e, callback.bind(this));
					else
						this.listenTo(subview, e, callback);
				}
			}
		}
	}
	if(keyValues)
		subview.setValuesForKeys(keyValues);
	subview.sid = Backbone.Cord._sid;
	Backbone.Cord._sid += 1;
	subview.el.setAttribute('data-sid', subview.sid);
	this.subviews[subview.sid] = subview;
	this.listenToOnce(subview, 'remove', function(subview) {
		this.stopListening(subview);
		delete this.subviews[subview.sid];
	});
	// Simply returns getSubviewById so that the property doesn't have another strong reference to the view that would also need to be cleaned up
	if(Backbone.Cord.config.idProperties && context.isView && id && Backbone.Cord.regex.testIdProperty(id)) {
		Object.defineProperty(this, id, {
			get: function() { return this.getSubviewById(id); },
			set: function(value) {
				var el, current;
				if(!(value instanceof Backbone.View))
					throw new Error('Attempting to assign a non-Backbone.View to a subview.');
				// Add the new subview and remove the old from the DOM
				el = value.el;
				current = this.getSubviewById(id);
				current.el.parentNode.insertBefore(el, current.el);
				current.remove();
				// If the new subview doesn't have an sid it needs to get setup, but without bindings or keyValues
				if(!value.sid)
					this._createSubview(value);
				// Reapply the id or remove the old property if a different id is used
				if(!Backbone.Cord.hasId(el))
					Backbone.Cord.setId(el, id, this.vuid);
				else if(id !== Backbone.Cord.getId(el))
					delete this[id];
			},
			enumerable: true,
			configurable: true
		});
	}
	this._callPlugins('complete', context);
	return subview;
}

function _createText(str) {
	return document.createTextNode(str);
}

function _render(element, container) {
	if(typeof element === 'function')
		element = (element.prototype instanceof Backbone.View) ? (new element()).el : element();
	else if(element instanceof Backbone.View)
		element = element.el;
	else if(typeof element === 'string')
		element = this.createText(element);
	else if(!(element instanceof Node))
		element = this.createElement(element);
	if(typeof container === 'string')
		container = document.querySelector(container);
	container.appendChild(element);
}

function _replace(child, element, container) {
	if(child === element)
		return;
	if(typeof container === 'string')
		container = document.querySelector(container);
	if(child) {
		if(child instanceof Backbone.View)
			child.remove();
		else
			container.removeChild(child);
	}
	this.render(element, container);
}

/*
 * Main Cord object.
 * Do NOT overwrite any top-level members, only modify sub objects such as Cord.regex.x
 * Inside modules, only alias top-level members not the modifiable nested because those may change, for example var regex = Cord.regex
 */
Backbone.Cord = {
	VERSION: '1.0.18',
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
		lower: function(str) { return str.toLowerCase(); },
		upper: function(str) { return str.toUpperCase(); },
		title: function(str) { return str.replace(/\b[^\s-]*/g, function(s) { return s.charAt(0).toUpperCase() + s.substr(1).toLowerCase(); }); }
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
		bool: function(el, value) { el.checked = Backbone.Cord.convertToBool(value); },
		checkbox: function(el, value) { el.checked = Backbone.Cord.convertToBool(value); }
	},
	decodeValue: function(el) {
		var decoder = Backbone.Cord.decoders[el.getAttribute('data-type') || el.getAttribute('type')];
		if(el.hasAttribute('data-null') && !el.value)
			return null;
		return decoder ? decoder(el) : el.value;
	},
	encodeValue: function(el, value) {
		var encoder = Backbone.Cord.encoders[el.getAttribute('data-type') || el.getAttribute('type')];
		if(encoder)
			encoder(el, value);
		else
			el.value = Backbone.Cord.convertToString(value);
		var evt = document.createEvent('HTMLEvents');
		evt.initEvent('change', true, true);
		el.dispatchEvent(evt);
	},
	// Mixins installed by the app by setting keys on this object
	mixins: {},
	copyObj: _copyObj,
	mixObj: _mixObj,
	mixProto: _mixProto,
	isPlainObj: _isPlainObj,
	getPrototypeValuesForKey: _getPrototypeValuesForKey,
	convertToString: function(obj) { if(obj === null || obj === void(0)) return ''; return obj.toString(); },
	convertToBool: function(value) { return !!(value && (value.length === void(0) || value.length)); },
	convertToNumber: function(value) { return Number(value) || 0; },
	// Generate a 2-byte time-secured random uid by taking the last 4 characters of a number between 0x10000 and 0x20000
	randomUID: function() { return (Math.floor((1 + Math.random()) * 0x10000) ^ (Date.now() % 0x10000)).toString(16).substr(1); }, // jshint ignore:line
	randomGUID: function() { var c4 = this.randomUID; return c4() + c4() + '-' + c4() + '-' + c4() + '-' + c4() + '-' + c4() + c4() + c4(); },
	randomCode: function(len) { var c = ''; len = len || 12; while(c.length < len) c += this.randomUID(); return c.substr(0, len); },
	// Run a callback immediately after the current call stack
	setImmediate: (root.requestAnimationFrame || root.setTimeout).bind(root),
	clearImmediate: (root.cancelAnimationFrame || root.clearTimeout).bind(root),
	// Internally set readonly properties with the ForceValue object
	ForceValue: function(value) { this.value = value; },
	// Initialize the Cord View class depending on the compatibility mode
	View: compatibilityMode ? Backbone.View.extend({}) : Backbone.View,
	// EmptyModel, EmptyView, and EmptyCollection to use as default model, subview placeholder, and fallback collection on setCollection(null)
	EmptyModel: new (Backbone.Model.extend({set: function() { return this; }, toString: function() { return ''; }}))(),
	EmptyView: Backbone.View.extend({ tagName: 'meta' }),
	EmptyCollection: new (Backbone.Collection.extend({add: function() { return this; }, reset: function() { return this; }, set: function() { return this; }, toString: function() { return ''; }}))(),
	// Unique internal subview id, this unifies how subviews with and without ids are stored
	_sid: 1,
	_pluginsChecked: false,
	_callPlugins: _callPlugins,
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
if(typeof exports === 'object')
	module.exports = Backbone.Cord;

Backbone.Cord.log = (debug ? function() {
	var format = [];
	var args = Array.prototype.slice.call(arguments);
	for(var i = 0; i < args.length; ++i)
		format.push((typeof args[i] === 'object') ? '%O' : '%s');
	args.unshift(format.join(' | '));
	console.log.apply(console, args);
} : function(){});

// Layout creation methods should be bound to allow importing of each individually
Backbone.Cord.h = Backbone.Cord.createElement = _createElement.bind(Backbone.Cord);
Backbone.Cord.createText = _createText.bind(Backbone.Cord);
Backbone.Cord.render = _render.bind(Backbone.Cord);
Backbone.Cord.replace = _replace.bind(Backbone.Cord);

// Override or wrap to provide different keyPath processing, different prefixes, or shorthands
// The return value must be an array of the different key path components, with the first being the namespace normalized to lowercase
Backbone.Cord.parseKeyPath = function(keyPath) {
	var components;
	keyPath = keyPath.replace(/__/g, '.');
	components = keyPath.split('.');
	// Default to the view scope
	if(components.length === 1 || !Backbone.Cord._scopes[components[0].toLowerCase()])
		components.unshift('this');
	else
		components[0] = components[0].toLowerCase();
	return components;
};

Backbone.Cord.hasId = function(el) {
	return !!el.getAttribute('data-id');
};
Backbone.Cord.getId = function(el) {
	return el.getAttribute('data-id').split('-')[0];
};
Backbone.Cord.setId = function(el, id, vuid) {
	el.setAttribute('data-id', id + (vuid ? ('-' + vuid) : ''));
};

// Use get/set attribute because className doesn't work with svg elements
// cls argument for add/remove can be a space separated string or an array of single class strings
Backbone.Cord.hasClass = function(el, cls) {
	return (el.getAttribute('class') || '').split(' ').indexOf(cls) !== -1;
};
Backbone.Cord.addClass = function(el, cls) {
	if(!Array.isArray(cls))
		cls = cls.split(' ');
	for(var i = 0; i < cls.length; ++i) {
		if(!Backbone.Cord.hasClass(el, cls[i]))
			el.setAttribute('class', ((el.getAttribute('class') || '') + ' ' + cls[i]).trim());
	}
};
Backbone.Cord.removeClass = function(el, cls) {
	var i, clss = (el.getAttribute('class') || '').split(' ');
	if(!Array.isArray(cls))
		cls = cls.split(' ');
	for(i = clss.length - 1; i >= 0; --i) {
		if(cls.indexOf(clss[i]) !== -1)
			clss.splice(i, 1);
	}
	el.setAttribute('class', clss.join(' '));
};

Backbone.Cord.regex.replaceIdSelectors = function(query, vuid) {
	return query.replace(this.idSelectorValues, '[data-id="$1' + (vuid ? ('-' + vuid) : '') + '"]');
};
Backbone.Cord.regex.testIdProperty = function(id, noThrow) {
	var result = this.idPropertyTest.test(id);
	if(!result && !noThrow)
		throw new Error('Invalid id "' + id + '" used');
	return result;
};
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
Object.defineProperties(Backbone.Cord.regex, {
	variable: _regexPropertyDescriptor('variable'),
	conditional: _regexPropertyDescriptor('conditional')
});
// Regex patterns can be configured by setting prefix/suffix values through these properties
Backbone.Cord.regex.variable = {prefix: '[', suffix: ']'};
Backbone.Cord.regex.conditional = {prefix: '(', suffix: ')'};

Backbone.Cord.plugins._check = function() {
	var i, j, plugin, loaded = {};
	for(i = 0; i < this.length; ++i)
		loaded[this[i].name] = true;
	for(i = 0; i < this.length; ++i) {
		plugin = this[i];
		if(plugin.requirements) {
			for(j = 0; j < plugin.requirements.length; ++j)
				if(!loaded[plugin.requirements[j]])
					throw new Error('Backbone.Cord plugin "' + plugin.name + '" requires missing plugin "' + plugin.requirements[j] + '"');
		}
	}
};
Backbone.Cord.plugins._register = function(plugin, fnc) {
	// Copy all of the default config settings
	if(plugin.config) {
		for(var setting in plugin.config) {
			if(plugin.config.hasOwnProperty(setting) && !Backbone.Cord.config.hasOwnProperty(setting))
				Backbone.Cord.config[setting] = plugin.config[setting];
		}
	}
	// Push references to all of the callback methods
	for(var callback in Backbone.Cord._callbacks) {
		if(Backbone.Cord._callbacks.hasOwnProperty(callback) && typeof plugin[callback] === 'function')
			fnc.call(Backbone.Cord._callbacks[callback], plugin[callback]);
	}
	// Register a variable scope
	if(plugin.scope)
		Backbone.Cord._scopes[plugin.scope.namespace.toLowerCase()] = plugin.scope;
	return fnc.call(this, plugin);
};
Backbone.Cord.plugins.unshift = function(plugin) {
	return this._register(plugin, Array.prototype.unshift);
};
Backbone.Cord.plugins.push = function(plugin) {
	return this._register(plugin, Array.prototype.push);
};

// Expose createElement and createSubview on the View object as well
// _callPlugins is added because this._callPlugins is used for callbacks
Backbone.Cord.View.prototype.createElement = _createElement;
Backbone.Cord.View.prototype.createSubview = _createSubview;
Backbone.Cord.View.prototype.createText = _createText;
Backbone.Cord.View.prototype._callPlugins = _callPlugins;

// Built-in view property scope for observing view properties
// Observe to add observer methods for existing view properties first and model attributes second
// Partly based on the watch/unwatch polyfill here: https://gist.github.com/eligrey/384583
// If wrapping properties, be sure to set configurable: true and (recommended) enumerable: true
function _propertyObserver(key, prevSet) {
	var newSet = function(value) {
		if(this['_' + key] === value)
			return;
		if(prevSet)
			prevSet.call(this, value);
		else
			this['_' + key] = value;
		this._invokeObservers('this', key, this[key]);
	};
	newSet._cordWrapped = true;
	newSet._prevSet = prevSet;
	return newSet;
}
Backbone.Cord._scopes.this = {
	observe: function(key) {
		var prop = Object.getOwnPropertyDescriptor(this, key);
		if(!prop)
			return;
		if(!prop.set._cordWrapped) {
			if(prop.set) {
				// Just wrap the setter of a defined property
				Object.defineProperty(this, key, {set: _propertyObserver(key, prop.set)});
			}
			else {
				// Define a new property without an existing defined setter
				this['_' + key] = this[key];
				if(delete this[key]) {
					Object.defineProperty(this, key, {
						get: this._synthesizeGetter(key),
						set: _propertyObserver(key),
						enumerable: true,
						configurable: true
					});
				}
			}
		}
	},
	unobserve: function(key) {
		if(!this._hasObservers('this', key)) {
			var prop = Object.getOwnPropertyDescriptor(this, key);
			if(prop.set._prevSet) {
				// Unwrap the previous set method
				Object.defineProperty(this, key, {set: prop.set._prevSet});
			}
			else {
				// Convert the property back to a normal attribute
				var value = this[key];
				delete this[key];
				this[key] = value;
			}
		}
	},
	getValue: function(key) {
		return this[key];
	},
	setValue: function(key, value) {
		this[key] = value;
	}
};
Backbone.Cord.View.prototype._synthesizeGetter = function(key) {
	key = '_' + key;
	return function() { return this[key]; };
};
Backbone.Cord.View.prototype._synthesizeSetter = function(key) {
	key = '_' + key;
	return function(value) { this[key] = value; };
};
Backbone.Cord.View.prototype._synthesizeReadonlySetter = function(key) {
	key = '_' + key;
	return function(value) {
		if(typeof value === 'object' && Object.getPrototypeOf(value) === Backbone.Cord.ForceValue.prototype)
			this[key] = value.value;
		else
			throw new Error('Attempting to assign a readonly property.');
	};
};
// Synthesize and define a property using a simple definition, which is one or more of (get, set, value, readonly)
// When definition is a function it implies {get: definition}
// When definition is just a value it implies {value: definition} - plain objects need to be explicity set under the value key
// When get or set is missing default accessors that read/write the backing _key are used
// When set is null or readonly is true - a readonly property is created that throws an exception when trying to assign
// Readonly properties are publicly readonly but privately writeable by assigning values with the Backbone.Cord.ForceValue object
Backbone.Cord.View.prototype._synthesizeProperty = function(key, definition) {
	var value = null;
	var readonly = false;
	var descriptor = { configurable: true, enumerable: true };
	if(typeof definition === 'function') {
		descriptor.get = definition;
	}
	else if(_isPlainObj(definition)) {
		value = definition.value;
		readonly = definition.readonly;
		descriptor.get = definition.get;
		descriptor.set = definition.set;
	}
	else {
		value = definition;
	}
	descriptor.get = descriptor.get || this._synthesizeGetter(key);
	descriptor.set = (descriptor.set === null || readonly) ? this._synthesizeReadonlySetter(key) : descriptor.set || this._synthesizeSetter(key);
	Object.defineProperty(this, key, descriptor);
	Object.defineProperty(this, '_' + key, {configurable: false, enumerable: false, value: value, writable: true});
};

// Do not externally modify the array or object returned from this method
// An empty array or object are returned when no observers exist
// key argument is optional
// create is also optional and if true will interally create the observer array or object as needed
Backbone.Cord.View.prototype._getObservers = function(namespace, key, create) {
	var observers;
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
Backbone.Cord.View.prototype._hasObservers = function(namespace, key) {
	var observers = this._getObservers(namespace, key);
	if(Array.isArray(observers))
		return !!observers.length;
	return !!Object.keys(observers).length;
};
Backbone.Cord.View.prototype._addObserver = function(namespace, key, observer) {
	var observers = this._getObservers(namespace, key, true);
	observers.push(observer);
};
Backbone.Cord.View.prototype._removeObserver = function(namespace, key, observer) {
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
Backbone.Cord.View.prototype._invokeObservers = function(namespace, key, value) {
	Backbone.Cord.log(namespace, key, value);
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
		func.call(this, key, !Backbone.Cord.convertToBool(value));
	};
}
function _applySubkeys(func, keys) {
	return function(key, value) {
		return func.call(this, key, _getObjValue(value, keys));
	};
}
Backbone.Cord.View.prototype.observe = function(key, observer, immediate) {
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
			filters.push(Backbone.Cord.filters[names[i].trim()] || Math[names[i].trim()]);
		observer = _applyFilters(observer, filters);
	}
	// If key starts with %, just do an immediate timeout with the getValue
	// Doesn't include the key on callback since this is used only for binding straight to some output
	if(key[0] === '%') {
		key = key.substr(1);
		observer.call(this, null, this.getValueForKey.call(this, key));
		return this;
	}
	path = Backbone.Cord.parseKeyPath(key);
	namespace = path[0];
	key = path[1];
	scope = Backbone.Cord._scopes[namespace];
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
Backbone.Cord.View.prototype.unobserve = function(key, observer) {
	var path, namespace, scope;
	if(typeof observer === 'string')
		observer = this[observer];
	if(!observer)
		return this;
	path = Backbone.Cord.parseKeyPath(key);
	namespace = path[0];
	key = path[1];
	scope = Backbone.Cord._scopes[namespace];
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
Backbone.Cord.View.prototype.getValueForKey = function(keyPath) {
	var path, scope, value;
	path = Backbone.Cord.parseKeyPath(keyPath);
	scope = Backbone.Cord._scopes[path[0]];
	value = scope.getValue.call(this, path[1]);
	if(path.length > 2)
		value = _getObjValue(value, path.slice(2));
	return value;
};
Backbone.Cord.View.prototype.setValueForKey = function(keyPath, value) {
	var path, scope;
	path = Backbone.Cord.parseKeyPath(keyPath);
	scope = Backbone.Cord._scopes[path[0]];
	// Use _setObjValue with subkeys, code is optimized with the first getValue, also valid is: _setObjValue(this, path, value);
	if(path.length > 2)
		_setObjValue(scope.getValue.call(this, path[1]), path.slice(2), value);
	else
		scope.setValue.call(this, path[1], value);
	return this;
};
Backbone.Cord.View.prototype.setValuesForKeys = function(values) {
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

Backbone.Cord.View.prototype.getChildById = function(id) {
	return this.el.querySelector('[data-id="' + id + '-' + this.vuid + '"]');
};
Backbone.Cord.View.prototype.getSubviewById = function(id) {
	var node = this.getChildById(id);
	if(node)
		return this.subviews[node.getAttribute('data-sid')];
};

// Built-in model scope that simply wraps access to the model, the model listening for observing is managed by setModel()
Backbone.Cord._scopes.model = {
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
Backbone.Cord.View.prototype._modelObserver = function(model, options) {
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
Backbone.Cord.View.prototype.model = Backbone.Cord.EmptyModel;
Backbone.Cord.View.prototype.setModel = function(newModel, noCascade) {
	var key, current, subview, observers;
	if(this.model === newModel)
		return this;
	if(!newModel)
		newModel = Backbone.Cord.EmptyModel;
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
		if(this.model === Backbone.Cord.EmptyModel) {
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
				if(!(subview instanceof Backbone.Cord.View))
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
// NOTE: Backbone.Cord.View.prototype.collection is set to EmptyCollection only in the collection mixin
Backbone.Cord.View.prototype.setCollection = function(newCollection) {
	if(this.collection === newCollection)
		return this;
	if(!newCollection)
		newCollection = Backbone.Cord.EmptyCollection;
	if(!(newCollection instanceof Backbone.Collection))
		throw new Error('Attempting to assign a non-Backbone.Collection to View.collection.');
	this.stopListening(this.collection);
	this.collection = newCollection;
	return this;
};

var __extend = Backbone.Cord.View.extend;
Backbone.Cord.View.extend = function(protoProps, staticProps) {
	protoProps = protoProps || {};
	staticProps = staticProps || {};
	if(protoProps.mixins) {
		var mixArgs = protoProps.mixins;
		delete protoProps.mixins;
		mixArgs.push(protoProps);
		protoProps = _mixProto.apply(Backbone.Cord, mixArgs);
	}
	// Create a unique view id for this view class. Can set a static vuid for debugging
	protoProps.vuid = protoProps.vuid || Backbone.Cord.randomUID() + Backbone.Cord.randomUID();
	// Call all of the plugins
	_callPlugins.call(this, 'extend', {protoProps: protoProps, staticProps: staticProps});
	// Replace all of the id selectors in the event delegation
	var key, value, events = protoProps.events;
	if(events) {
		for(key in events) {
			if(events.hasOwnProperty(key) && key.indexOf('#') !== -1) {
				value = events[key];
				delete events[key];
				key = Backbone.Cord.regex.replaceIdSelectors(key, protoProps.vuid);
				events[key] = value;
			}
		}
	}
	// Inherit parent events, properties, and observers - only need to worry about direct inheritance as inheritance builds on itself
	if(this.prototype.events && protoProps.events)
		protoProps.events = _mixObj(this.prototype.events, protoProps.events);
	if(this.prototype.properties && protoProps.properties)
		protoProps.properties = _mixObj(this.prototype.properties, protoProps.properties);
	if(this.prototype.observers && protoProps.observers)
		protoProps.observers = _mixObj(this.prototype.observers, protoProps.observers);
	return __extend.call(this, protoProps, staticProps);
};

// Wrap _ensureElement to add a subviews array
var __ensureElement = Backbone.Cord.View.prototype._ensureElement;
Backbone.Cord.View.prototype._ensureElement = function() {
	if(!Backbone.Cord._pluginsChecked) {
		Backbone.Cord.plugins._check();
		Backbone.Cord._pluginsChecked = true;
	}
	// If model or collection is provided as a class in the prototype, then create a new instance
	// This ensures availability on creating the layout but the fetch will need to be started by the View
	var proto = Object.getPrototypeOf(this);
	if(typeof proto.collection === 'function')
		this.collection = new proto.collection();
	else if(typeof proto.model === 'function')
		this.model = new proto.model();
	this.subviews = {};
	this._observers = {};
	// Run plugin create hooks
	this._callPlugins('create', {});
	// Synthesize any declared properties
	var key;
	if(this.properties) {
		var properties = this.properties;
		for(key in properties)
			if(properties.hasOwnProperty(key))
				this._synthesizeProperty(key, properties[key]);
	}
	// Bind the el method with prefixed args
	// _createElement is added to override Backbone's _createElement when el is not a function
	this._createElement = this.createElement.bind(this);
	if(typeof this.el === 'function' && Backbone.Cord.config.prefixCreateElement)
		this.el = this.el.bind(this, this._createElement);
	// Start listening to the model
	if(this.model !== Backbone.Cord.EmptyModel)
		this.listenTo(this.model, 'change', this._modelObserver);
	// Use backbone to actually create the element
	var ret, prevContext = Backbone.Cord._viewContext;
	Backbone.Cord._viewContext = this;
	try {
		ret = __ensureElement.apply(this, arguments);
	}
	finally {
		Backbone.Cord._viewContext = prevContext;
	}
	// Travel the prototype chain and apply all the classNames found, join into a single space separated string because some values might be space separated
	Backbone.Cord.addClass(this.el, _getPrototypeValuesForKey(this, 'className').join(' '));
	this.el.setAttribute('data-vuid', this.vuid);
	// Run plugin initializers
	this._callPlugins('initialize', {});
	// Setup any declared observers
	if(this.observers) {
		var observers = this.observers;
		for(key in observers)
			if(observers.hasOwnProperty(key))
				this.observe(key, observers[key], false);
	}
	return ret;
};

// Wrap the remove method to also process subviews and plugins
var __remove = Backbone.Cord.View.prototype.remove;
Backbone.Cord.View.prototype.remove = function() {
	var key;
	this._callPlugins('remove', {});
	for(key in this.subviews) {
		if(this.subviews.hasOwnProperty(key))
			this.subviews[key].remove();
	}
	this.subviews = null;
	// Some scopes do not need extra cleanup - just setting observers to null and calling stopListening() in __remove()
	// other scopes should implement remove() plugin callback
	this._observers = null;
	this.trigger('remove', this);
	return __remove.apply(this, arguments);
};

})(((typeof self === 'object' && self.self === self && self) || (typeof global === 'object' && global.global === global && global)));
