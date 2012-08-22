/*!
* (mt) Stats
*
* A little library to access your MediaTemple server's stats.
*
* Copyright (c) 2012 Andrew Weeks http://meloncholy.com
* Licensed under the MIT licence. See http://meloncholy.com/licence
* Version 0.0.1
*/

"use strict";

var https = require("https");
var util = require("util");
var url = require("url");
var settings = require("konphyg")(__dirname + "/config/")("mt-stats");

var currentOp = url.parse(settings.currentUrl.replace("%SERVICEID", settings.serviceId).replace("%APIKEY", settings.apiKey));
var historyUrl = settings.historyUrl.replace("%SERVICEID", settings.serviceId).replace("%APIKEY", settings.apiKey);
var rangeUrl = settings.rangeUrl.replace("%SERVICEID", settings.serviceId).replace("%APIKEY", settings.apiKey);

Object.defineProperty(mtStats, "interval", { get: function () { return settings.interval; } });
Object.defineProperty(mtStats, "metrics", { get: function () { return settings.metrics; } });

function mtStats(req, res) {
	var reqUrl = url.parse(req.url, true);
	var start;
	var end;
	var range;
	var rangeIdx;
	var step;
	var t;
	var stuff = [];
	stuff.apiOps = [];
	// Time since Unix epoch.
	var now = Math.round(new Date().getTime() / 1000.0);
	// Personal epoch.
	var epoch;
	var loop = false;

	if (reqUrl.path.length > settings.rootPath.length) {
		range = reqUrl.path.substring(settings.rootPath.length);

		if (range.indexOf("-") !== -1) {
			t = range.split("-");
			epoch = +t[0];
			end = +t[1];
			loop = true;
		} else if (isNumber(range)) {
			epoch = Math.floor(now - +range);
			end = now;
			loop = true;
		} else if (settings.definedRanges.indexOf(range) !== -1) {
			stuff.apiOps.push(url.parse(historyUrl.replace("%RANGE", range)));
		} else {
			stuff.apiOps.push(currentOp);
		}

		if (loop) {
			rangeIdx = getRange(end - epoch);
			// May not get the resolution specified, e.g. currently 120, 240 -> 60, 1800 -> 2220.
			step = settings.ranges[rangeIdx].step;
			start = Math.max(epoch, end - step + 1);
			
			while (end > epoch) {
				stuff.apiOps.push(url.parse(rangeUrl.replace("%START", start).replace("%END", end).replace("%RESOLUTION", settings.ranges[rangeIdx].resolution)));
				start = Math.max(epoch, start - step);
				end -= step;
			}
		}
	} else {
		stuff.apiOps.push(currentOp);
	}

	stuff.done = 0;
	stuff.count = stuff.apiOps.length;

	for (var i = 0, len = stuff.count; i < len; i++) {
		stuff[stuff.count - i - 1] = "";
		mtReq(res, stuff, i);
	}
}

function mtReq(res, stuff, index) {
	var apiReq;

	(apiReq = https.request(stuff.apiOps[index], function (apiRes) {
		apiRes.on("data", function (chunk) {
			mtData(res, chunk, stuff, index);
		});

		apiRes.on("end", function () {
			mtRender(res, stuff, index);
		});
	})).end();

	apiReq.on("error", function (e) {
		console.log(e);
	});
}

function mtData(res, chunk, stuff, index) {
	chunk = chunk.toString();

	if (chunk.indexOf("DataNotAvailable") !== -1) {
		console.error((new Date()).toString(), "Fetching range", index, "again...");
		// Should always be "" (first chunk), but just in case.
		stuff[stuff.count - index - 1] = "";
		mtReq(res, stuff, index);
	} else {
		// Results are in reverse time order.
		stuff[stuff.count - index - 1] += chunk;
	}
}

function mtRender(res, stuff, index) {
	if (stuff[stuff.count - index - 1] === "" || ++stuff.done < stuff.count) return;

	res.end(stuff.join("").replace(/\]\}\}\{"statsList":.*?"stats":\[/g, ","));
}

function getRange(totalRange) {
	for (var i = 0, len = settings.ranges.length; i < len && settings.ranges[i].range < totalRange; i++);
	return Math.min(i, len - 1);
}

function num(v) {
	return parseInt(v, 10) || 0;
}

function isNumber(value) {
	return !isNaN(parseInt(value * 1));
}

module.exports = mtStats;
