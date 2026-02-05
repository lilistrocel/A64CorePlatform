// Fix customer sequence counter
db = db.getSiblingDB("a64core_db");

// Find the highest customer code number
var customers = db.customers.find({}, {customerCode: 1}).sort({customerCode: -1}).limit(5).toArray();
printjson(customers);

// Get current counter
var counter = db.counters.findOne({_id: "customer_sequence"});
printjson(counter);

// Find the max numeric value from customer codes
var maxCode = 0;
db.customers.find({}, {customerCode: 1}).forEach(function(doc) {
    if (doc.customerCode) {
        var num = parseInt(doc.customerCode.replace("C", ""));
        if (num > maxCode) maxCode = num;
    }
});

// Set counter to max + 1
var newValue = maxCode + 1;
db.counters.updateOne(
    {_id: "customer_sequence"},
    {$set: {value: newValue}},
    {upsert: true}
);

// Verify
var updated = db.counters.findOne({_id: "customer_sequence"});
printjson({maxCode: maxCode, newCounterValue: updated.value});
