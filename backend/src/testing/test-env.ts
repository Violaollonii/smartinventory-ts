/**
 * Imported first by specs that boot the whole app: AppModule validates the
 * environment as soon as it is loaded, so these must be set before that.
 */
process.env.MONGODB_URI = 'mongodb://127.0.0.1:27017/not-used-in-tests';
process.env.JWT_SECRET = 'test-secret-test-secret-test-secret-1234';
