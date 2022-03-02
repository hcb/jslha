(function(f){if(typeof exports==="object"&&typeof module!=="undefined"){module.exports=f()}else if(typeof define==="function"&&define.amd){define([],f)}else{var g;if(typeof window!=="undefined"){g=window}else if(typeof global!=="undefined"){g=global}else if(typeof self!=="undefined"){g=self}else{g=this}g.JSLha = f()}})(function(){var define,module,exports;return (function(){function r(e,n,t){function o(i,f){if(!n[i]){if(!e[i]){var c="function"==typeof require&&require;if(!f&&c)return c(i,!0);if(u)return u(i,!0);var a=new Error("Cannot find module '"+i+"'");throw a.code="MODULE_NOT_FOUND",a}var p=n[i]={exports:{}};e[i][0].call(p.exports,function(r){var n=e[i][1][r];return o(n||r)},p,p.exports,r,e,n,t)}return n[i].exports}for(var u="function"==typeof require&&require,i=0;i<t.length;i++)o(t[i]);return o}return r})()({1:[function(require,module,exports){
'use strict';

var bb = require('./bit-eater');
var Decoder = require('./decoder');


function Archive(data) {
  this.data = data;
  this.bitstream = new bb.BitStream(data);
  this.sequence = [];
  this.files = {};
}

Archive.prototype.getSequence = function () {
  return this.sequence;
};

Archive.prototype.getFiles = function () {
  return this.files;
};

Archive.prototype.extract = function (index) {
  var decoder = Decoder.forMethod(this.sequence[index].method);
  
  
  var fileHeader = this.sequence[index];
  fileHeader.content = decoder.decode(fileHeader.data, fileHeader.uncompressedSize);
  return fileHeader.content;
};

Archive.prototype.extractByName = function (name) {
  for (var i = 0; i < this.sequence.length; i++) {
    if (name == this.sequence[i].name) {
      return this.extract(i);
    }
  }
  // not found
  return [];
};

Archive.prototype.parseFile = function () {
  do {
    var level = this.peekNextHeaderLevel();
    
    switch (level) {
      case 0:
        this.sequence.push(this.parseHeadersLevel0());
        break;
      case 1:
        this.sequence.push(this.parseHeadersLevel1());
        break;
      default:
        throw new Error('Level not implemented: '+ level);
    }
  } while (this.peekNextHeaderSize() != 0);

  this.files = {};
  for (var i = 0; i < this.sequence.length; i++) {
    this.files[this.sequence[i].name] = this.sequence[i];
  }
  return this.files;
};

Archive.prototype.peekNextHeaderSize = function () {
  
  return this.bitstream.view.getUint8(this.bitstream.index);
};

Archive.prototype.peekNextHeaderLevel = function () {
  
  return this.bitstream.view.getUint8(this.bitstream.index + 20 * 8);
};


/*
Offset   Length   Contents
  0      1 byte   Size of archived file header (h)
  1      1 byte   Header checksum
  2      5 bytes  Method ID
  7      4 bytes  Compressed size (n)
 11      4 bytes  Uncompressed size
 15      4 bytes  Original file date/time (Generic time stamp)
 19      1 byte   File attribute
 20      1 byte   Level (0x00)
 21      1 byte   Filename / path length in bytes (f)
 22     (f)bytes  Filename / path
 22+(f)  2 bytes  CRC-16 of original file
 24+(f) (n)bytes  Compressed data
 */
Archive.prototype.parseHeadersLevel0 = function () {
  var level0 = {
    headerSize: this.bitstream.readUint8(),
    headerCRC: this.bitstream.readUint8(),
    method: this.bitstream.readASCIIString(5),
    compressedSize: this.bitstream.readUint32(),
    uncompressedSize: this.bitstream.readUint32(),
    originalTimestamp: this.bitstream.readUint32(),
    fileAttribute: this.bitstream.readUint8(),
    level: this.bitstream.readUint8(),
    filenameLength: this.bitstream.readUint8(),
    // webmsx compatibility
    content: null,
    isDir: false,
    asUint8Array: function () { return this.content; }
  };
  var filename = this.bitstream.readASCIIString(level0.filenameLength);
  var originalFileCRC16 = this.bitstream.readUint16();
  var data = this.bitstream.readArrayBuffer(level0.compressedSize);
  level0.name = filename;
  level0.originalFileCRC16 = originalFileCRC16;
  level0.data = data;
  // webmsx compatibility
  level0.lastModifiedDate = new Date(level0.originalTimestamp * 1000);
  return level0;
};

/*
level-1
Offset   Length   Contents
  0      1 byte   Size of archived file header (h)
  1      1 byte   Header checksum
  2      5 bytes  Method ID
  7      4 bytes  Compressed size (n)
 11      4 bytes  Uncompressed size
 15      4 bytes  Original file date/time (Generic time stamp)
 19      1 byte   0x20
 20      1 byte   Level (0x01)
 21      1 byte   Filename / path length in bytes (f)
 22     (f)bytes  Filename / path
 22+(f)  2 bytes  CRC-16 of original file
 24+(f)  1 byte   OS ID
 25+(f)  2 bytes  Next header size(x) (0 means no extension header)
[ // Extension headers
         1 byte   Extension type
     (x)-3 bytes  Extension fields
         2 bytes  Next header size(x) (0 means no next extension header)
]*
        (n)bytes  Compressed data

*/

/*
Extension header
Common header:
         1 byte   Extension type (0x00)
         2 bytes  CRC-16 of header
        [1 bytes  Information] (Optional)
         2 bytes  Next header size

File name header:
         1 byte   Extension type (0x01)
         ? bytes  File name
         2 bytes  Next header size

Directory name header:
         1 byte   Extension type (0x02)
         ? bytes  Directory name
         2 bytes  Next header size

Comment header:
         1 byte   Extension type (0x3f)
         ? bytes  Comments
         2 bytes  Next header size

UNIX file permission:
         1 byte   Extension type (0x50)
         2 bytes  Permission value
         2 bytes  Next header size

UNIX file group/user ID:
         1 byte   Extension type (0x51)
         2 bytes  Group ID
         2 bytes  User ID
         2 bytes  Next header size

UNIX file group name:
         1 byte   Extension type (0x52)
         ? bytes  Group name
         2 bytes  Next header size

UNIX file user name:
         1 byte   Extension type (0x53)
         ? bytes  User name
         2 bytes  Next header size

UNIX file last modified time:
         1 byte   Extension type (0x54)
         4 bytes  Last modified time in UNIX time
         2 bytes  Next header size
*/

Archive.prototype.parseHeadersLevel1 = function () {
  var headerStart = this.bitstream._index;
  var level1 = {
    headerSize: this.bitstream.readUint8(),
    headerCRC: this.bitstream.readUint8(),
    method: this.bitstream.readASCIIString(5),
    compressedSize: this.bitstream.readUint32(),
    uncompressedSize: this.bitstream.readUint32(),
    originalTimestamp: this.bitstream.readUint32(),
    fileAttribute: this.bitstream.readUint8(),
    level: this.bitstream.readUint8(),
    filenameLength: this.bitstream.readUint8(),
    // webmsx compatibility
    content: null,
    isDir: false,
    asUint8Array: function () { return this.content; }
  };
  var filename = this.bitstream.readASCIIString(level1.filenameLength);
  var originalFileCRC16 = this.bitstream.readUint16();
  var osId = this.bitstream.readASCIIString(1);
  var extraHeaders = [];
  var extraHeadersSize = 0;
  for (var headerSize = this.bitstream.readUint16(); headerSize > 0;) {
    extraHeadersSize += headerSize;
    var header = [];
    for (var i = 0; i < headerSize - 2; i++) {
      header.push(this.bitstream.readUint8());
    }
    extraHeaders.push(header);
    headerSize = this.bitstream.readUint16();
  }
  level1.compressedSize = level1.compressedSize - extraHeadersSize;
  var data = this.bitstream.readArrayBuffer(level1.compressedSize);
  level1.osId = osId;
  level1.extraHeaders = extraHeaders;
  level1.name = filename;
  level1.originalFileCRC16 = originalFileCRC16;
  level1.data = data;
  // webmsx compatibility
  level1.lastModifiedDate = new Date(level1.originalTimestamp * 1000);
  return level1;
};

// TODO: level2

module.exports = Archive;

},{"./bit-eater":2,"./decoder":3}],2:[function(require,module,exports){
'use strict';

var Endianness = {
	BIG_ENDIAN: 1,
	LITTLE_ENDIAN: 2
};
/**********************************************************
 *
 * BitView
 *
 * BitView provides a similar interface to the standard
 * DataView, but with support for bit-level reads / writes.
 *
 **********************************************************/
var BitView = function (source, byteOffset, byteLength, endianness) {
	if (source instanceof Uint8Array) {
		source = source.buffer;
	}
	var isBuffer = source instanceof ArrayBuffer ||
		(typeof Buffer !== 'undefined' && source instanceof Buffer);

	if (!isBuffer) {
		throw new Error('Must specify a valid ArrayBuffer or Buffer.');
	}

	byteOffset = byteOffset || 0;
	byteLength = byteLength || source.byteLength /* ArrayBuffer */ || source.length /* Buffer */;

	this.endianness = endianness || Endianness.BIG_ENDIAN;
	this._view = new Uint8Array(source, byteOffset, byteLength);
};

Object.defineProperty(BitView.prototype, 'buffer', {
	get: function () { return typeof Buffer !== 'undefined' ? Buffer.from(this._view.buffer) : this._view.buffer; },
	enumerable: true,
	configurable: false
});

Object.defineProperty(BitView.prototype, 'byteLength', {
	get: function () { return this._view.length; },
	enumerable: true,
	configurable: false
});

BitView.prototype._setBit = function (offset, on) {
	if (on) {
		this._view[offset >> 3] |= 1 << (7 - (offset & 7));
	} else {
		this._view[offset >> 3] &= ~(1 << (7 - (offset & 7)));
	}
};

BitView.prototype.getBits = function (offset, bits, signed) {
	if (bits > 32) {
		// FIXME: could be solved by not using bitwise operators (bitwise uses 32 bit integers)
		// multiplication, addition, etc, until 53 bits (max safe integer)
		throw new Error('Too many bits read');
	}
	var available = (this._view.length * 8 - offset);

	if (bits > available) {
		throw new Error('Cannot get ' + bits + ' bit(s) from offset ' + offset + ', ' + available + ' available');
	}

	var value = 0;
	for (var i = 0; i < bits;) {
		var remaining = bits - i;
		var bitOffset = offset & 7;
		var currentByte = this._view[offset >> 3];

		// the max number of bits we can read from the current byte
		var read = Math.min(remaining, 8 - bitOffset);

		// create a mask with the correct bit width
		var mask = (1 << read) - 1;
		var readBits;
		if (bitOffset + remaining > 8) {
			readBits = currentByte & mask;
			value |= readBits << (bits - i - read);
		} else {
			// shift the bits we want to the start of the byte and mask of the rest
			readBits = (currentByte >> (8 - bitOffset - remaining)) & mask;
			value |= readBits;
		}

		offset += read;
		i += read;
	}

	if (signed) {
		// If we're not working with a full 32 bits, check the
		// imaginary MSB for this bit count and convert to a
		// valid 32-bit signed value if set.
		if (bits !== 32 && value & (1 << (bits - 1))) {
			value |= -1 ^ ((1 << bits) - 1);
		}

		return value;
	}

	return value >>> 0;
};

BitView.prototype.setBits = function (offset, value, bits) {
	var available = (this._view.length * 8 - offset);

	if (bits > available) {
		throw new Error('Cannot set ' + bits + ' bit(s) from offset ' + offset + ', ' + available + ' available');
	}
	for (var i = 0; i < bits;) {
		var wrote;
		var remaining = bits - i;

		// Write an entire byte if we can.
		if ((bits - i) >= 8 && ((offset & 7) === 0)) {
			this._view[offset >> 3] = (value & (0xFF << (remaining - 8)) >> (remaining - 8));
			wrote = 8;
		} else {
			var bitMask = (1 << (remaining - 1));
			this._setBit(offset, value & bitMask);
			wrote = 1;
		}

		offset += wrote;
		i += wrote;
	}
};

BitView.prototype.fixEndianness = function (bytes) {
	var result = 0;
	if (this.endianness == Endianness.LITTLE_ENDIAN) {
		bytes.reverse();
	}
	for (var i = 0; i < bytes.length; i++) {
		result |= (bytes[i] << (8 * i));
	}
	return result;
};
BitView.prototype.getBoolean = function (offset) {
	return this.getBits(offset, 1, false) !== 0;
};
BitView.prototype.getInt8 = function (offset) {
	return this.getBits(offset, 8, true);
};
BitView.prototype.getUint8 = function (offset) {
	return this.getBits(offset, 8, false);
};
BitView.prototype.getInt16 = function (offset) {
	return this.fixEndianness([
		this.getBits(offset, 8, false),
		this.getBits(offset + 8, 8, true)]);
};
BitView.prototype.getUint16 = function (offset) {
	return this.fixEndianness([
		this.getBits(offset, 8, false),
		this.getBits(offset + 8, 8, false)]) >>> 0;
};
BitView.prototype.getInt32 = function (offset) {
	return this.fixEndianness([
		this.getUint8(offset),
		this.getUint8(offset + 8),
		this.getUint8(offset + 16),
		this.getInt8(offset + 24)]);
};
BitView.prototype.getUint32 = function (offset) {
	return this.fixEndianness([
		this.getUint8(offset),
		this.getUint8(offset + 8),
		this.getUint8(offset + 16),
		this.getUint8(offset + 24)]) >>> 0;
};

BitView.prototype.setBoolean = function (offset, value) {
	this.setBits(offset, value ? 1 : 0, 1);
};
BitView.prototype.setInt8 =
	BitView.prototype.setUint8 = function (offset, value) {
		this.setBits(offset, value, 8);
	};
BitView.prototype.setBytes = function (offset, bytes) {
	if (this.endianness == Endianness.LITTLE_ENDIAN) {
		bytes.reverse();
	}
	for (var i = 0; i < bytes.length; i++) {
		this.setBits(offset + (i * 8), bytes[i], 8);
	}
};
BitView.prototype.setInt16 =
	BitView.prototype.setUint16 = function (offset, value) {
		var low = value & 0xFF;
		var high = value >> 8;
		this.setBytes(offset, [low, high]);
	};
BitView.prototype.setInt32 =
	BitView.prototype.setUint32 = function (offset, value) {
		var bytes = [];
		for (var i = 0; i < 4; i++) {
			bytes.push(value & 0xFF);
			value = value >> 8;
		}
		this.setBytes(offset, bytes);
	};
BitView.prototype.getArrayBuffer = function (offset, byteLength) {
	var buffer = new Uint8Array(byteLength);
	for (var i = 0; i < byteLength; i++) {
		buffer[i] = this.getUint8(offset + (i * 8));
	}
	return buffer;
};

/**********************************************************
 *
 * BitStream
 *
 * Small wrapper for a BitView to maintain your position,
 * as well as to handle reading / writing of string data
 * to the underlying buffer.
 *
 **********************************************************/
var reader = function (name, size) {
	return function () {
		if (this._index + size > this._length) {
			throw new Error('Trying to read past the end of the stream');
		}
		var val = this._view[name](this._index);
		this._index += size;
		return val;
	};
};

var writer = function (name, size) {
	return function (value) {
		this._view[name](this._index, value);
		this._index += size;
	};
};

function readASCIIString(stream, bytes) {
	return readString(stream, bytes);
}

function readString(stream, bytes) {
	if (bytes === 0) {
		return '';
	}
	var i = 0;
	var chars = [];
	var append = true;
	var fixedLength = !!bytes;
	if (!bytes) {
		bytes = Math.floor((stream._length - stream._index) / 8);
	}

	// Read while we still have space available, or until we've
	// hit the fixed byte length passed in.
	while (i < bytes) {
		var c = stream.readUint8();

		// Stop appending chars once we hit 0x00
		if (c === 0x00) {
			append = false;

			// If we don't have a fixed length to read, break out now.
			if (!fixedLength) {
				break;
			}
		}
		if (append) {
			chars.push(c);
		}
		i++;
	}

	return String.fromCharCode.apply(null, chars);
}

function writeASCIIString(stream, string, bytes) {
	var length = bytes || string.length + 1;  // + 1 for NULL

	for (var i = 0; i < length; i++) {
		stream.writeUint8(i < string.length ? string.charCodeAt(i) : 0x00);
	}
}

function writeUTF8String(stream, string, bytes) {
	var byteArray = stringToByteArray(string);

	var length = bytes || byteArray.length + 1;  // + 1 for NULL
	for (var i = 0; i < length; i++) {
		stream.writeUint8(i < byteArray.length ? byteArray[i] : 0x00);
	}
}

function stringToByteArray(str) { // https://gist.github.com/volodymyr-mykhailyk/2923227
	var b = [], i, unicode;
	for (i = 0; i < str.length; i++) {
		unicode = str.charCodeAt(i);
		// 0x00000000 - 0x0000007f -> 0xxxxxxx
		if (unicode <= 0x7f) {
			b.push(unicode);
			// 0x00000080 - 0x000007ff -> 110xxxxx 10xxxxxx
		} else if (unicode <= 0x7ff) {
			b.push((unicode >> 6) | 0xc0);
			b.push((unicode & 0x3F) | 0x80);
			// 0x00000800 - 0x0000ffff -> 1110xxxx 10xxxxxx 10xxxxxx
		} else if (unicode <= 0xffff) {
			b.push((unicode >> 12) | 0xe0);
			b.push(((unicode >> 6) & 0x3f) | 0x80);
			b.push((unicode & 0x3f) | 0x80);
			// 0x00010000 - 0x001fffff -> 11110xxx 10xxxxxx 10xxxxxx 10xxxxxx
		} else {
			b.push((unicode >> 18) | 0xf0);
			b.push(((unicode >> 12) & 0x3f) | 0x80);
			b.push(((unicode >> 6) & 0x3f) | 0x80);
			b.push((unicode & 0x3f) | 0x80);
		}
	}

	return b;
}

var BitStream = function (source, byteOffset, byteLength, endianness) {
	if (source instanceof Uint8Array) {
		source = source.buffer;
	}
	var isBuffer = source instanceof ArrayBuffer ||
		(typeof Buffer !== 'undefined' && source instanceof Buffer);

	if (!(source instanceof BitView) && !isBuffer) {
		throw new Error('Must specify a valid BitView, ArrayBuffer or Buffer');
	}

	if (isBuffer) {
		this._view = new BitView(source, byteOffset, byteLength, endianness);
	} else {
		this._view = source;
	}

	this._index = 0;
	this._startIndex = 0;
	this._length = this._view.byteLength * 8;
};

Object.defineProperty(BitStream.prototype, 'index', {
	get: function () { return this._index - this._startIndex; },
	set: function (val) { this._index = val + this._startIndex; },
	enumerable: true,
	configurable: true
});

Object.defineProperty(BitStream.prototype, 'length', {
	get: function () { return this._length - this._startIndex; },
	set: function (val) { this._length = val + this._startIndex; },
	enumerable: true,
	configurable: true
});

Object.defineProperty(BitStream.prototype, 'bitsLeft', {
	get: function () { return this._length - this._index; },
	enumerable: true,
	configurable: true
});

Object.defineProperty(BitStream.prototype, 'byteIndex', {
	// Ceil the returned value, over compensating for the amount of
	// bits written to the stream.
	get: function () { return Math.ceil(this._index / 8); },
	set: function (val) { this._index = val * 8; },
	enumerable: true,
	configurable: true
});

Object.defineProperty(BitStream.prototype, 'buffer', {
	get: function () { return this._view.buffer; },
	enumerable: true,
	configurable: false
});

Object.defineProperty(BitStream.prototype, 'view', {
	get: function () { return this._view; },
	enumerable: true,
	configurable: false
});

BitStream.prototype.readBits = function (bits, signed) {
	var val = this._view.getBits(this._index, bits, signed);
	this._index += bits;
	return val;
};

BitStream.prototype.writeBits = function (value, bits) {
	this._view.setBits(this._index, value, bits);
	this._index += bits;
};

BitStream.prototype.readBoolean = reader('getBoolean', 1);
BitStream.prototype.readInt8 = reader('getInt8', 8);
BitStream.prototype.readUint8 = reader('getUint8', 8);
BitStream.prototype.readInt16 = reader('getInt16', 16);
BitStream.prototype.readUint16 = reader('getUint16', 16);
BitStream.prototype.readInt32 = reader('getInt32', 32);
BitStream.prototype.readUint32 = reader('getUint32', 32);

BitStream.prototype.writeBoolean = writer('setBoolean', 1);
BitStream.prototype.writeInt8 = writer('setInt8', 8);
BitStream.prototype.writeUint8 = writer('setUint8', 8);
BitStream.prototype.writeInt16 = writer('setInt16', 16);
BitStream.prototype.writeUint16 = writer('setUint16', 16);
BitStream.prototype.writeInt32 = writer('setInt32', 32);
BitStream.prototype.writeUint32 = writer('setUint32', 32);

BitStream.prototype.readASCIIString = function (bytes) {
	return readASCIIString(this, bytes);
};

BitStream.prototype.writeASCIIString = function (string, bytes) {
	writeASCIIString(this, string, bytes);
};

BitStream.prototype.readBitStream = function (bitLength) {
	var slice = new BitStream(this._view);
	slice._startIndex = this._index;
	slice._index = this._index;
	slice.length = bitLength;
	this._index += bitLength;
	return slice;
};

BitStream.prototype.writeBitStream = function (stream, length) {
	if (!length) {
		length = stream.bitsLeft;
	}

	var bitsToWrite;
	while (length > 0) {
		bitsToWrite = Math.min(length, 8);
		this.writeBits(stream.readBits(bitsToWrite), bitsToWrite);
		length -= bitsToWrite;
	}
};

BitStream.prototype.readArrayBuffer = function (byteLength) {
	var buffer = this._view.getArrayBuffer(this._index, byteLength);
	this._index += (byteLength * 8);
	return buffer;
};

BitStream.prototype.writeArrayBuffer = function (buffer, byteLength) {
	this.writeBitStream(new BitStream(buffer), byteLength * 8);
};

module.exports = {
	BitView: BitView,
	BitStream: BitStream,
	Endianness: Endianness
};

},{}],3:[function(require,module,exports){
'use strict';

var NewDecoder = require('./new_decoder');
var NullDecoder = require('./null_decoder');

function Decoder() {
}

Decoder.forMethod = function (name) {
  switch (name) {
    case '-lh0-':
      
      return new NullDecoder();
    case '-lh5-':
      
      var config = NewDecoder.getNewDecoderConfig(14, 4);
      return new NewDecoder.NewDecoder(config);
    default:
      return null;
  }
};


module.exports = Decoder;

},{"./new_decoder":5,"./null_decoder":6}],4:[function(require,module,exports){
'use strict';

var Archive = require('./archive');

function JSLha(content) {
  if (!(this instanceof JSLha)) {
    return new JSLha(content);
  }
  this.content = content;
  this.archive = new Archive(content);
  this.archive.parseFile();
  for (var i = 0; i < this.archive.sequence.length; i++) {
    var data = this.archive.extract(i);
    
    this.archive.sequence[i].content = data;
  }

  this.files = this.archive.sequence;
}

JSLha.prototype.file = function (regex_or_name) {
  if (Object.prototype.toString.call(regex_or_name) === "[object RegExp]") {
    
    var regexp = regex_or_name;
    return this.filter(function (relativePath, file) {
      return !file.dir && regexp.test(relativePath);
    });
  }
  else { // text
    
    var name = regex_or_name;
    return this.filter(function (relativePath, file) {
      return !file.dir && relativePath === name;
    })[0] || null;
  }

};

JSLha.prototype.folder = function (regex_or_name) {
  
  // TODO: implement
  return [];
};

JSLha.prototype.filter = function (search) {
  
  var result = [],
    filename, relativePath, file, fileClone;
  for (var i = 0; i < this.files.length; i++) {
    
    /*
    if (!this.files[i].hasOwnProperty(filename)) {
      
      continue;
    }
    */
    result.push(this.files[i]);
  }
  return result;
};

module.exports = JSLha;
},{"./archive":1}],5:[function(require,module,exports){
'use strict';

var bb = require('./bit-eater');
var tree = require('./tree');

function NewDecoder(options) {
  if (!(this instanceof NewDecoder))
    return new NewDecoder(options);

  this.options = options;
  this.ringBuffer = newArray(options.ringBufferSize, 0);
  this.ringBufferPosition = 0;
  this.blockRemaining = 0;
  this.codeTree = new tree.Tree(options.numCodes * 2);
  this.offsetTree = new tree.Tree(options.maxTempCodes * 2);
  this.outputStream = [];
}

function newArray(len, value) {
  var result = new Array(len);
  while (--len >= 0) {
    result[len] = value;
  }
  return result;
}

function getNewDecoderConfig(historyBits, offsetBits) {
  var rBufSize = 1 << historyBits;
  return {
    copyThreshold: 3,
    historyBits: historyBits,
    offsetBits: offsetBits,
    ringBufferSize: rBufSize,
    outputBufferSize: rBufSize,
    // maxReadSize: this.outputBufferSize,
    numCodes: 510,
    maxTempCodes: 20
  };
}

NewDecoder.prototype.decode = function (data, originalSize) {
  this.bitstream = new bb.BitStream(data.buffer, null, null, bb.Endianness.LITTLE_ENDIAN);

  // lhasa input_stream, short-cut
  // FIXME: check the size of output
  var bytesRemaining = data.length;
  var totalBytes = 0;
  do {
    // from lha_reader::do_decode

    // from lha_decoder::read
    var bytesOutput = this.readAndOutput();
    if (!bytesOutput) {
      
      throw new Error('Decoding failed: got nothing');
    } else {
      totalBytes += bytesOutput;
    }

  } while (bytesRemaining > 0 && totalBytes < originalSize);

  if (totalBytes == this.options.outputBufferSize) {
    
  }

  this.bitstream = null;
  return this.outputStream;
};

NewDecoder.prototype.readLength = function () {
  var len = this.bitstream.readBits(3);
  if (len < 0)
    return -1;
  if (len == 7) {
    for (; ;) {
      var i = this.bitstream.readBits(1);
      if (i < 0) return -1;
      else if (i == 0) break;
      len++;
    }
  }
  return len;
};

NewDecoder.prototype.readTempTable = function () {

  var n = this.bitstream.readBits(5);
  if (n < 0) return 0;

  if (n == 0) {
    var code = this.bitstream.readBits(5);
    if (code < 0) return 0;
    this.offsetTree.setSingle(code);
    return 1;
  }
  n = Math.min(n, this.options.maxTempCodes);
  var codeLengths = [];
  for (var i = 0; i < n; i++) {
    var len = this.readLength();
    if (len < 0) return 0;
    codeLengths.push(len);
    if (i == 2) {
      len = this.bitstream.readBits(2);
      if (len < 0) return 0;
      for (var j = 0; j < len; j++) {
        i++;
        codeLengths.push(0);
      }
    }
  }
  tree.buildTree(this.offsetTree, this.options.maxTempCodes * 2, codeLengths, n);
};

NewDecoder.prototype.readAndOutput = function () {
  while (this.blockRemaining == 0) {
    if (!this.startNewBlock()) return 0;
  }
  --this.blockRemaining;
  var result = 0;
  var code = this.codeTree.read(this.bitstream);
  if (code < 0) return 0;
  if (code < 256) {
    result = this.outputByte(code);
  } else {
    result = this.copyFromHistory(code - 256 + this.options.copyThreshold);
  }
  return result;
};

var printByte = function (byte) {
  var hex = byte.toString(16);
  hex = hex.length == 1 ? '0x0' + hex : '0x' + hex;
  
};

NewDecoder.prototype.outputByte = function (byte) {
  // printByte(byte);
  this.outputStream.push(byte);
  this.ringBuffer[this.ringBufferPosition] = byte;
  this.ringBufferPosition = (this.ringBufferPosition + 1) % this.options.ringBufferSize;
  return 1;
};

NewDecoder.prototype.copyFromHistory = function (count) {
  var offset = this.readOffsetCode();
  if (offset < 0) return;
  // FIXME: need to check this is correct >>>
  var start = this.ringBufferPosition + this.options.ringBufferSize - offset - 1;
  for (var i = 0; i < count; i++) {
    this.outputByte(this.ringBuffer[(start + i) % this.options.ringBufferSize]);
  }
  return count;
};

NewDecoder.prototype.readOffsetCode = function () {
  var bits = this.offsetTree.read(this.bitstream);
  if (bits < 0) return -1;
  if (bits == 0) return 0;
  else if (bits == 1) {
    return 1;
  } else {
    var result = this.bitstream.readBits(bits - 1);
    if (result < 0) return -1;
    return result + (1 << (bits - 1));
  }
};

NewDecoder.prototype.startNewBlock = function () {
  var len = this.bitstream.readBits(16);
  if (len < 0) return 0;
  this.blockRemaining = len;
  if (!this.readTempTable()) return 0;
  if (!this.readCodeTable()) return 0;
  if (!this.readOffsetTable()) return 0;
  return 1;
};

NewDecoder.prototype.readSkipCount = function (skipRange) {
  var result = 0;
  if (skipRange == 0) result = 1;
  // skiprange=1 => 3-18 codes
  else if (skipRange == 1) {
    result = this.bitstream.readBits(4);
    if (result < 0) return -1;
    result += 3;
  }
  // skiprange=2 => 20+ codes.
  else {
    result = this.bitstream.readBits(9);
    if (result < 0) return -1;
    result += 20;
  }
  return result;
};

NewDecoder.prototype.readTempTable = function () {
  var codeLengths = newArray(this.options.maxTempCodes, 0);
  var n = this.bitstream.readBits(5, false);
  if (n < 0) return 0;
  if (n == 0) {
    var code = this.bitstream.readBits(5);
    if (code < 0) return 0;
    this.offsetTree.setSingle(code);
    return 1;
  }
  n = Math.min(n, this.options.maxTempCodes);
  for (var i = 0; i < n; i++) {
    var len = this.readLength();
    if (len < 0) return 0;
    codeLengths[i] = len;
    if (i == 2) {
      len = this.bitstream.readBits(2);
      if (len < 0) return 0;
      for (var j = 0; j < len; j++) {
        i++;
        codeLengths[i] = 0;
      }
    }
  }
  tree.buildTree(this.offsetTree, this.options.maxTempCodes * 2, codeLengths, n);
  return 1;
};

NewDecoder.prototype.readCodeTable = function () {
  var codeLengths = newArray(this.options.numCodes, 0);
  var n = this.bitstream.readBits(9);
  var code;
  if (n < 0) return 0;
  if (n == 0) {
    code = this.bitstream.readBits(9);
    if (code < 0) return 0;
    this.codeTree.setSingle(code);
    return 1;
  }
  n = Math.min(n, this.options.numCodes);
  var i = 0;
  while (i < n) {
    code = this.offsetTree.read(this.bitstream);
    if (code < 0) return 0;
    if (code <= 2) {
      var skipCount = this.readSkipCount(code);
      if (skipCount < 0) return 0;
      for (var j = 0; j < skipCount && i < n; j++) {
        codeLengths[i] = 0;
        i++;
      }
    } else {
      codeLengths[i] = code - 2;
      i++;
    }
  }
  tree.buildTree(this.codeTree, this.options.numCodes * 2, codeLengths, n);
  return 1;
};

NewDecoder.prototype.readOffsetTable = function () {
  var codeLengths = newArray(this.options.historyBits, 0);
  var n = this.bitstream.readBits(this.options.offsetBits);
  if (n < 0) return 0;
  if (n == 0) {
    var code = this.bitstream.readBits(this.options.offsetBits);
    if (code < 0) return 0;
    this.offsetTree.setSingle(code);
    return 1;
  }
  n = Math.min(n, this.options.historyBits);
  for (var i = 0; i < n; i++) {
    var len = this.readLength();
    if (len < 0) return 0;
    codeLengths[i] = len;
  }
  tree.buildTree(this.offsetTree, this.options.maxTempCodes * 2, codeLengths, n);
  return 1;
};

module.exports = {
  NewDecoder: NewDecoder,
  getNewDecoderConfig: getNewDecoderConfig
};

},{"./bit-eater":2,"./tree":7}],6:[function(require,module,exports){
'use strict';

function NullDecoder() {
}

NullDecoder.prototype.decode = function (data, uncompressedSize) {
  if (data.length == uncompressedSize) {
    return data;
  }
  else {
    
    return [];
  }
};

module.exports = NullDecoder;

},{}],7:[function(require,module,exports){
'use strict';

var TREE_NODE_LEAF_VALUE = 1 << 63;

function Tree(size) {
  this.tree = [];
  var i = size;
  while (i > 0) {
    this.tree.push(TREE_NODE_LEAF_VALUE);
    i--;
  }
}

Tree.prototype.read = function (bitStream) {
  var code = this.tree[0];
  while ((code & TREE_NODE_LEAF_VALUE) == 0) {
    var bit = bitStream.readBits(1);
    if (bit < 0) return -1;
    code = this.tree[code + bit];
  }
  return (code & ~TREE_NODE_LEAF_VALUE);
};

// FIXME: maybe this should be 'static' factory method
Tree.prototype.setSingle = function (code) {
  this.tree[0] = code | TREE_NODE_LEAF_VALUE;
};


function buildTree(tree, treeLen, codeLengths, numCodeLengths) {
  var buildData = {
    tree: tree,
    treeLen: treeLen,
    nextEntry: 0,
    treeAllocated: 1,
  };

  var codeLen = 0;
  do {
    expandQueue(buildData);
    codeLen++;
  } while (addCodesWithLength(buildData, codeLengths, numCodeLengths, codeLen));
}

function expandQueue(buildData) {
  var newNodes = (buildData.treeAllocated - buildData.nextEntry) * 2;
  if (buildData.treeAllocated + newNodes > buildData.treeLen) return;
  var endOffset = buildData.treeAllocated;
  while (buildData.nextEntry < endOffset) {
    buildData.tree.tree[buildData.nextEntry] = buildData.treeAllocated;
    buildData.treeAllocated += 2;
    buildData.nextEntry++;
  }
}

function addCodesWithLength(buildData, codeLengths, numCodeLengths, codeLen) {
  var codesRemaining = 0;
  for (var i = 0; i < numCodeLengths; i++) {
    if (codeLengths[i] == codeLen) {
      var node = readNextEntry(buildData);
      buildData.tree.tree[node] = i | TREE_NODE_LEAF_VALUE;
    } else if (codeLengths[i] > codeLen) codesRemaining = 1;
  }
  return codesRemaining;
}

function readNextEntry(buildData) {
  if (buildData.nextEntry >= buildData.treeAllocated) return 0;
  var result = buildData.nextEntry;
  buildData.nextEntry++;
  return result;
}

module.exports = { Tree: Tree, buildTree: buildTree };

},{}]},{},[4])(4)
});
