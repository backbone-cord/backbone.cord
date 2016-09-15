var assert = require('assert');
var jsdom = require('jsdom');
var _ = require('lodash');
var cord = require('../backbone.cord');

assert.element = function(el, tagName, id, classes, attrs) {
	assert.equal(el.nodeType, 1);
	assert.equal(el.tagName.toLowerCase(), tagName.toLowerCase());
	if(id)
		assert.equal(el.getAttribute('data-id'), id);
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

describe('copy methods', function() {
	describe('copyObj({})', function() {
		var orig = {};
		var copy = cord.copyObj(orig);
		it('copy should not be original', function() { assert.notStrictEqual(orig, copy); });
		it('copy should be equal to original', function() { assert.deepEqual(orig, copy); });
		it('copy should be empty', function() { assert.ok(!Object.keys(copy).length); });
	});
	describe('copyObj({a:123, b: [], c: "string", sub: {}})', function() {
		var orig = {a:123, b: [], c: "string", sub: {}};
		var copy = cord.copyObj(orig);
		it('copy should not be original', function() { assert.notStrictEqual(orig, copy); });
		it('copy should be equal to original', function() { assert.deepEqual(orig, copy); });
		it('copy should have the same primitive keys and values', function() {
			assert.strictEqual(orig.a, copy.a);
			assert.strictEqual(orig.b, copy.b);
			assert.strictEqual(orig.c, copy.c);
		});
		it('copy sub object should not be the original sub object', function() {
			assert.notStrictEqual(orig.sub, copy.sub);
		});
		it('altering copy primitive should not alter original', function() {
			copy.a = 'hello';
			assert.notEqual(orig.a, copy.a);
		});
		it('altering copy arrays should alter original', function() {
			copy.b.push('hello');
			assert.deepEqual(orig.b, copy.b);
		});
	});
	describe('copyObj({a:{a:123, b:456, c:789}, b:{a:901}})', function() {
		var orig = {a:{a:123, b:456, c:789}, b:{a:901}};
		var copy = cord.copyObj(orig);
		it('copy should not be original', function() { assert.notStrictEqual(orig, copy); });
		it('copy should be equal to original', function() { assert.deepEqual(orig, copy); });
		it('copy sub object should not be the original sub object', function() {
			assert.notStrictEqual(orig.a, copy.a);
			assert.notStrictEqual(orig.b, copy.b);
		});
		it('sub objects should equal the original sub objects', function() {
			assert.deepEqual(orig.a, copy.a);
			assert.deepEqual(orig.b, copy.b);
		});
	});
	describe('copyObj({a:subclass})', function() {
		var Subclass = function() { this.a = 123; this.b = 456; };
		var orig = {sub:new Subclass()};
		var copy = cord.copyObj(orig);
		it('copy should not be original', function() { assert.notStrictEqual(orig, copy); });
		it('copy should be equal to original', function() { assert.deepEqual(orig, copy); });
		it('altering copy.sub should alter original.sub', function() {
			copy.sub.a = 'hello';
			assert.deepEqual(orig.sub, copy.sub);
		});
	});
});

describe('mix methods', function() {
	describe('mixObj()', function() {
		var combined = cord.mixObj({a:2, styles: {cursor: 'pointer', div: { display: 'block'}}}, {b:3, styles: {color: 'blue', font: 'times'}}, {c:4, styles: {color: 'red', div: { textAlign: 'center'}}});
		it('combined should have a, b, c, and styles subobject combined', function() {
			assert.deepEqual({a: 2, b: 3, c: 4, styles: { cursor: 'pointer', color: 'red', font: 'times', div: {textAlign: 'center', display: 'block'}}}, combined);
		});
	})
});

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
			assert.equal(el.outerHTML, '<div data-id="dog">jumped over the fence</div>');
			assert.element(el, 'div', 'dog');
			assert.text(el.childNodes[0], 'jumped over the fence');
		});
	});
});

// TODO: maybe prevent the subview method from being called outside of a View
describe('_subview', function() {});
