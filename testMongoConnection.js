const { MongoClient } = require('mongodb');

async function testConnection() {
  const uri = 'mongodb://localhost:27017'; // MongoDB connection string
  const client = new MongoClient(uri);

  try {
    // Connect to MongoDB
    await client.connect();
    console.log('✅ Connected to MongoDB');

    // Select the database and collection
    const db = client.db('test'); // Database name
    const collection = db.collection('messages'); // Collection name

    // Check if the collection has any documents
    const document = await collection.findOne();
    if (document) {
      console.log('✅ Found a document:', document);
    } else {
      console.log('⚠️ No documents found in the "messages" collection.');
    }
  } catch (error) {
    console.error('❌ Connection error:', error);
  } finally {
    // Close the connection
    await client.close();
  }
}

testConnection();