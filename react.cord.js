;(function(Backbone) {
'use strict';

var Cord = Backbone.Cord;
var extendObj = Cord.extendObj;
var isPlainObj = Cord.isPlainObj;
var mixProto = Cord.mixProto;
var ForceValue = Cord.ForceValue;

var encodeValue = Cord.encodeValue;
var decodeValue = Cord.decodeValue;
var randomGUID = Cord.randomGUID;
var setImmediate = Cord.setImmediate;
var regex = Cord.regex;

var preact = require('preact');
var Component = preact.Component;
var options = preact.options;

var _currentComponent = null;
var _currentBinding = null;
var _DATA_BINDING_ATTR = 'data-binding';

function _bindGUID(uid, proxy) {
	var guid = null;
	if(uid) {
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
			// Wrapped in a function to remove the key, value arguments from passing to forceUpdate
			if(guid && this._boundGUIDProxies[guid])
				this._boundGUIDProxies[guid].call(this, guid, key, value);
			else
				this.forceUpdate();
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
			if(mixin.properties.hasOwnProperty(attr)) {
				value = mixin.properties[attr];
				if(typeof value === 'function')
					state[attr] = computed(value);
				else if(isPlainObj(value))
					state[attr] = value.get ? computed(value.get) : value.value;
				else state[attr] = value;
			}
		}
	}
	for(attr in mixin) {
		if(mixin.hasOwnProperty(attr)) {
			value = mixin[attr];
			if(typeof value === 'function')
				methods[(lifecycleMap[attr] || attr)] = value;
		}
	}
	mixin.methods = methods;
	mixin.state = state;
	mixin._normalized = true;
}

// Inherit from preact's Component so render can be wrapped and mixins applied
Cord.Component = function() {
	Component.apply(this, arguments);

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
			extendObj(proto, mixProto(proto, mixin.methods));
			extendObj(state, mixin.state);
		}
		proto._mixinState = state;
		proto._mixinsApplied = true;
	}

	var __render = this.render;
	this.render = function() {
		var ret, prevComponent = _currentComponent;
		_currentComponent = this;
		try {
			ret = __render.apply(this, arguments);
		}
		finally {
			_currentComponent = prevComponent;
		}
		return ret;
	};

	var __componentWillMount = this.componentWillMount;
	this.componentWillMount = function() {
		var i, attr, args, value, state = this.state;
		// Initialize computed state and any initial state from mixins
		if(this._mixinState)
			extendObj(state, this._mixinState);
		for(attr in state) {
			if(state.hasOwnProperty(attr)) {
				value = state[attr];
				if(typeof value === 'function' && value._computed) {
					args = value._args;
					// Setup as proxy setting the name of the property as the guid
					this._boundGUIDProxies[attr] = value;
					for(i = 0; i < args.length; ++i)
						bind(args[i], attr);
					// Run once to set the initial state
					value(attr);
				}
			}
		}
		if(__componentWillMount)
			__componentWillMount.apply(this, arguments);
	};
};
Cord.Component.prototype = Object.create(Component);
Cord.Component.prototype.constructor = Cord.Component;

Cord.Component.prototype.setState = function(state, callback) {
	if(typeof state === 'function')
		state = state(this.state, this.props);
	for(var key in state) {
		if(state.hasOwnProperty(key) && this._hasObservers('this', key))
			this._invokeObservers('this', key, state[key]);
	}
	Component.prototype.setState.call(this, state, callback);
};

// Extend Component with data binding methods without backwards compatibility Event functions (bind/unbind)
Cord.objExtend(Cord.Component.prototype, Cord.Binding, Backbone.Events);
delete Cord.Component.prototype.bind;
delete Cord.Component.prototype.unbind;

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
		var el = e.currenTarget;
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
	var attrs = vnode.attributes;

	if(!vnode.attributes.raw) {
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
						spliceArgs.push(Cord.bind(regex.variableValue.exec(matches[j])[1]));
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
		var guid = _bindGUID(vnode.attrs.key || vnode.attrs.name, _bindingProxy);

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
				if(guid)
					setImmediate(_bindingProxy.bind(null, guid, null, value));
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

})(((typeof self === 'object' && self.self === self && self) || (typeof global === 'object' && global.global === global && global)).Backbone || require('backbone'));
