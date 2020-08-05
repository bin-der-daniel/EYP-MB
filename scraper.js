// This is a template for a Node.js scraper on morph.io (https://morph.io)

var cheerio = require("cheerio");
var request = require("request");
var sqlite3 = require("sqlite3").verbose();
var moment = require("moment");

var root = "https://members.eyp.org";
var sessionDateFormat = "DD/MM/YYYY";
var callDateFormat = "DD/MM/YYYY-hh:mm";

function initDatabase(callback) {
	// Set up sqlite database.
	var db = new sqlite3.Database("data.sqlite");
	db.serialize(function() {
		db.run("CREATE TABLE IF NOT EXISTS sessions (link TEXT PRIMARY KEY, title TEXT, start TEXT, end TEXT, country TEXT, type TEXT, city TEXT)");
		db.run("CREATE TABLE IF NOT EXISTS calls (link TEXT, position TEXT, start TEXT,  deadline TEXT, PRIMARY KEY (link, position), FOREIGN KEY(link) REFERENCES sessions(link))");
		callback(db);
	});
}


function insertSession(db, session) {
	var statememt = db.prepare("INSERT OR REPLACE INTO sessions (link,title,start,end,country) VALUES (?,?,?,?,?)");
	statememt.run(session.link, session.title, moment(session.start, sessionDateFormat).toISOString(),
		moment(session.end, sessionDateFormat).toISOString(), session.country);
	statememt.finalize();
}

function insertCall(db, call) {
	var statement = db.prepare("INSERT OR REPLACE INTO calls VALUES (?,?,?,?)");
	statement.run(call.link, call.position, moment(call.start, callDateFormat).toISOString(),
		moment(call.deadline, callDateFormat).toISOString());
	statement.finalize();
	console.log("Call inserted" + call.link + " - " + call.position);
}

function updateSession(db, link, data) {
	// Make something more secure against SQLi
	var setString = "";
	Object.keys(data).forEach(function (item) {
		setString += item + "='" + data[item] + "',";
	});
	setString = setString.substring(0, setString.length-1);
	var statement = db.prepare(`UPDATE sessions SET ${setString} WHERE link=?`);
	statement.run(link);
	statement.finalize();
	console.log(("Updated ") + link);
}

function readRows(db) {
	// Read some data.
	db.each("SELECT rowid AS id, title, start, end FROM sessions", function(err, row) {
		console.log(row.id + ": " + row.title + " - " + row.start + " - " + row.end);
	});
}

function fetchPage(url, callback) {
	// Use request to read in pages.
	request(url, function (error, response, body) {
		if (error) {
			console.log("Error requesting page: " + error);
			return;
		}
		callback(body);
	});
}

function fetchSession(db, link) {
	fetchPage(link, function (body) {
		var $ = cheerio.load(body);
		var data = {
			type: $("div.field-name-field-event-type > div.field-items > div.field-item").text().trim(),
			city: $("div.field-name-field-event-location-city > div.field-items > div.field-item").text().trim()
		};
		var genDeadline = $("div.field-name-field-event-general-deadline span.date-display-single").text().trim();
		var calls = $("ul.applic-times div.applic-time").each(function () {
			var call = {
				link: link,
				position: $(this).find("div.label").text().trim()
			};
			// Delete position element
			if ($(this).hasClass("general")) {
				call.start = moment(genDeadline, sessionDateFormat);
				call.deadline = call.start;
			} else {
				var dates = $(this).text().trim().split(' - ');
				call.start = dates[0].trim() + "-" + dates[1].trim();
				call.deadline = dates[2].trim() + "-" + dates[3].trim();
			}
			insertCall(db,call);
		});
		updateSession(db,link,data);
	});
}

function fetchRecursive(db, page) {
	fetchPage(root + "/events?page=" + page, function (body) {
		// Use cheerio to find things in the page with css selectors.
		var $ = cheerio.load(body);
		if ($("section.region-1 p.sorry-no-result").length > 0) {
			db.each("SELECT link FROM sessions", function(err, row) {
				fetchSession(db,row.link);
			});
			return;
		}
		var elements = $("section.region-1 div.view-events-list div.views-row").each(function () {
			var session = {
				// todo Find a solution for single dates (.date-display-single)
				link: root + $(this).find("h2 > a").attr("href").trim(),
				title: $(this).find("h2 > a").text().trim(),
				start: $(this).find("span.date-display-start").text().trim(),
				end: $(this).find("span.date-display-end").text().trim(), sessionDateFormat,
				country: $(this).find("div.field-name-field-event-location-country a").text().trim()
			};
			if (!session.start && !session.end) {
				session.start = $(this).find("span.date-display-single").text().trim();
				session.end = session.start;
			}
			insertSession(db,session);
		});
		console.log("Done with page " + page);
		fetchRecursive(db,++page);
	});
}

function run(db) {
	fetchRecursive(db,0);
	// Use request to read in pages.
	/*
	var done = false;
	for (var page = 0; page<10; page++) {
		fetchPage(root + "/events?page=" + page, function (body) {
			// Use cheerio to find things in the page with css selectors.
			var $ = cheerio.load(body);
			if ($("section.region-1 p.sorry-no-result").length > 0) {
				done = true;
				return;
			}
			var elements = $("section.region-1 div.view-events-list div.views-row").each(function () {
				var session = {
					// todo Find a solution for single dates (.date-display-single)
					link: root + $(this).find("h2 > a").attr("href").trim(),
					title: $(this).find("h2 > a").text().trim(),
					start: $(this).find("span.date-display-start").text().trim(),
					end: $(this).find("span.date-display-end").text().trim(),
					country: $(this).find("div.field-name-field-event-location-country a").text().trim()
				};
				updateSession(db,session);
			});
		});
	}
	 */
}

initDatabase(run);
