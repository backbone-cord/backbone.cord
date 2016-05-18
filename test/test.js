var assert = require('assert');
var jsdom = require('jsdom');
var _ = require('lodash');
var cord = require('../backbone.cord');

assert.element = function(el, tagName, id, classes, attrs) {
	assert.equal(el.nodeType, 1);
	assert.equal(el.tagName.toLowerCase(), tagName.toLowerCase());
	if(id)
		assert.equal(el.id, id);
	if(classes) {
		_.each(classes, function(cls) {
			assert(el.classList.contains(cls));
		});
	}
};

assert.text = function(e, text) {
	assert.equal(e.nodeType, 3);
	assert.equal(e.data, text);
};

describe('convert methods', function() {
	describe('convertToString(5)', function() {
		var str = cord.convertToString(5);
		it('should be 5', function() { assert.equal(str, '5'); });
		it('should be a string', function() { assert.equal(typeof str, 'string'); });
	});
	describe('convertToString(null)', function() {
		var str = cord.convertToString(null);
		it('should be empty', function() { assert.equal(str, ''); });
		it('should be a string', function() { assert.equal(typeof str, 'string'); });
	});
	describe('convertToBool("string")', function() {
		var b = cord.convertToBool('string');
		it('should be true', function() { assert.equal(b, true); });
	});
	describe('convertToBool(5)', function() {
		var b = cord.convertToBool(5);
		it('should be true', function() { assert.equal(b, true); });
	});
	describe('convertToBool({})', function() {
		var b = cord.convertToBool({});
		it('should be true', function() { assert.equal(b, true); });
	});
	describe('convertToBool(null)', function() {
		var b = cord.convertToBool(null);
		it('should be false', function() { assert.equal(b, false); });
	});
	describe('convertToBool([])', function() {
		var b = cord.convertToBool([]);
		it('should be false', function() { assert.equal(b, false); });
	});
	describe('convertToBool("")', function() {
		var b = cord.convertToBool('');
		it('should be false', function() { assert.equal(b, false); });
	});
});

describe('EmptyModel', function() {
	describe('set(key, value) should be a noop', function() {
		cord.EmptyModel.set('key', 'value');
		var value = cord.EmptyModel.get('key');
		it('get(key) should be undefined', function() { assert.equal(value, undefined); });
	});
});

describe('_el', function() {
	before(function(done) {
		// Run the tests with a document
		jsdom.env('', function (err, window) {
			global.document = window.document;
			done(err);
		});
	});
	describe('_el(tag#id.classes)', function() {
		it('should return <div></div>', function() { assert.element(cord._el(''), 'div'); });
		it('should return <div id="dog"></div>', function() { assert.element(cord._el('#dog'), 'div', 'dog'); });
		it('should return <input id="dog" class="black fluffy"></div>', function() { assert.element(cord._el('input#dog.black.fluffy'), 'input', 'dog', ['black', 'fluffy']); });
		it('should return <div id="dog">jumped over the fence</div>', function() {
			var el = cord._el('#dog', 'jumped over the fence');
			assert.equal(el.outerHTML, '<div id="dog">jumped over the fence</div>');
			assert.element(el, 'div', 'dog');
			assert.text(el.childNodes[0], 'jumped over the fence');
		});
	});
});

// TODO: maybe prevent the subview method from being called outside of a View
describe('_subview', function() {});
