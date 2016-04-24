;(function(Backbone) {
'use strict';

function _createExpressionProperty(expr, prop) {
	var i, key;
	var strings = expr.split(Backbone.Cord.regex.variableSearch);
	var matches = expr.match(Backbone.Cord.regex.variableSearch);
	// Create the function used to set the expression value
	var code = 'this.' + prop + ' = ';
	for(i = 0; i < matches.length; ++i) {
		code += strings[i];
		key = matches[i] = Backbone.Cord.regex.variableValue.exec(matches[i])[1];
		code += 'Number(this.getValueForKey("' + key + '"))';
	}
	code += strings[i] + ';';
	/* jshint -W054 */
	var fnc = new Function(code);
	// Manually add observers for all the variables and get one immediate callback with !i
	for(i = 0; i < matches.length; ++i) {
		key = matches[i];
		this.observe(key, fnc, !i);
	}
	// Define the expression property
	var descriptor = this._synthesizePropertyDescriptor(prop);
	descriptor.enumerable = false;
	Object.defineProperty(this, prop, descriptor);
}

function _replaceExpressions(str) {
	var i, expr, prop, newStr;
	var strings = str.split(Backbone.Cord.regex.expressionSearch);
	var matches = str.match(Backbone.Cord.regex.expressionSearch);
	if(!matches)
		return str;

	for(i = 0; i < matches.length; ++i) {
		expr = Backbone.Cord.regex.expressionValue.exec(matches[i])[1];
		prop = 'expr' + Math.floor(Math.random() * 9999999);
		matches[i] = Backbone.Cord.regex.variable.prefix + Backbone.Cord.config.viewPrefix + prop + Backbone.Cord.regex.variable.suffix;
		_createExpressionProperty.call(this, expr, prop);
	}

	// Rejoin strings and matches
	newStr = '';
	for(i = 0; i < matches.length; ++i) {
		newStr += strings[i];
		newStr += matches[i];
	}
	newStr += strings[i];
	return newStr;
}

// Math needs to run first before other plugins because it changes bindings
Backbone.Cord.plugins.unshift({
	name: 'math',
	requirements: ['viewscope'],
	attrs: function(context, attrs) {
		if(!context.isView)
			return;
		for(var attr in attrs) {
			if(attrs.hasOwnProperty(attr) && typeof attrs[attr] === 'string' && Backbone.Cord.regex.expressionSearch.test(attrs[attr]))
				attrs[attr] = _replaceExpressions.call(this, attrs[attr]);
		}
	},
	children: function(context, children) {
		// Similar to binding, look for text children
		if(!context.isView)
			return;
		for(var i = 0; i < children.length; ++i) {
			if(typeof children[i] === 'string' && Backbone.Cord.regex.expressionSearch.test(children[i]))
				children[i] = _replaceExpressions.call(this, children[i]);
		}
	},
	strings: function(context, strings) {
		for(var str in strings) {
			if(strings.hasOwnProperty(str) && typeof strings[str] === 'string' && Backbone.Cord.regex.expressionSearch.test(strings[str]))
				strings[str] = _replaceExpressions.call(this, strings[str]);
		}
	}
});

})(((typeof self === 'object' && self.self === self && self) || (typeof global === 'object' && global.global === global && global)).Backbone);
