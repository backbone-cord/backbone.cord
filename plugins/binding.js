;(function(Backbone) {
'use strict';

var _nodeProperties = {
	'innerHTML': true,
	'value': true,
	'checked': true
};

var _changeEventProperties = {
	'value': true,
	'checked': true
};

function _createAttrObserver(node, attr) {
	if(_nodeProperties[attr])
		return function(key, formatted) {
			if(attr === 'checked')
				node[attr] = Backbone.Cord.convertToBool(formatted);
			else
				node[attr] = Backbone.Cord.convertToString(formatted);
			if(Backbone.Cord.config.bindingDispatchChangeEvents && _changeEventProperties[attr]) {
				var evt = document.createEvent('HTMLEvents');
				evt.initEvent('change', true, true);
				node.dispatchEvent(evt);
			}
		};
	else
		return function(key, formatted) {
			node.setAttribute(attr, Backbone.Cord.convertToString(formatted));
		};
}

function _createChildObserver(node) {
	return function(key, value) {
		node.textContent = Backbone.Cord.convertToString(value);
	};
}

var _valueDecoders = {
	'range': function(el) { return parseInt(el.value); },
	'number': function(el) { return Number(el.value); },
	'integer': function(el) { return parseInt(el.value); },
	'decimal': function(el) { return parseFloat(el.value); },
	'date': function(el) { return new Date(el.value); },
	'datetime': function(el) { return new Date(el.value); },
	'checkbox': function(el) { return el.checked; }
};

function _createValueListener(key) {
	return function(e) {
		var el = e.currentTarget;
		var decoder = _valueDecoders[el.getAttribute('data-type') || el.getAttribute('type')];
		this.setValueForKey(key, decoder ? decoder.call(this, el) : el.value);
	};
}

Backbone.Cord.plugins.push({
	name: 'binding',
	requirements: ['interpolation'],
	config: {
		bindingDispatchChangeEvents: true
	},
	attrs: function(context, attrs) {
		var format, listener, expectChange;
		if(!context.isView)
			return;
		for(var attr in attrs) {
			if(attrs.hasOwnProperty(attr)) {
				format = attrs[attr];
				if(typeof format === 'string' && format.match(Backbone.Cord.regex.variableSearch)) {
					this.observeFormat(format, _createAttrObserver(context.el, attr), true);
					if(Backbone.Cord.config.bindingDispatchChangeEvents && _changeEventProperties[attr])
						expectChange = true;
					delete attrs[attr];
				}
			}
		}
		// Reverse binding on change or input events
		if(attrs.change) {
			listener = _createValueListener(attrs.change).bind(this);
			context.el.addEventListener('change', listener);
			delete attrs.change;
		}
		if(attrs.input) {
			listener = _createValueListener(attrs.input).bind(this);
			context.el.addEventListener('input', listener);
			delete attrs.input;
		}
		// Invoke the reverse listener with the initial value if an initial change event is not expected from an attribute observer
		if(listener && !expectChange)
			Backbone.Cord.setImmediate(listener.bind(this, {currentTarget: context.el}));
	},
	children: function(context, children) {
		var i, j, child, strings, matches, spliceArgs, node;
		if(!context.isView)
			return;
		for(i = children.length - 1; i >= 0; --i) {
			child = children[i];
			if(typeof child === 'string') {
				strings = child.split(Backbone.Cord.regex.variableSearch);
				if(strings.length > 1) {
					spliceArgs = [i, 1];
					matches = child.match(Backbone.Cord.regex.variableSearch);
					for(j = 0; j < matches.length; ++j) {
						if(strings[j].length)
							spliceArgs.push(document.createTextNode(strings[j]));
						node = document.createTextNode('');
						this.observe(Backbone.Cord.regex.variableValue.exec(matches[j])[1], _createChildObserver(node), true);
						spliceArgs.push(node);
					}
					if(strings[j].length)
						spliceArgs.push(document.createTextNode(strings[j]));
					Array.prototype.splice.apply(children, spliceArgs);
				}
			}
		}
	}
});

})(((typeof self === 'object' && self.self === self && self) || (typeof global === 'object' && global.global === global && global)).Backbone || require('backbone'));
