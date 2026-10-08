module.exports = {
    testEnvironment: 'node',
    testMatch: ['<rootDir>/tests/**/*.test.cjs'],
    clearMocks: true,
    restoreMocks: true,
    collectCoverageFrom: ['dist/**/*.js', '!dist/server.js'],
    coverageDirectory: 'coverage',
    testTimeout: 15000,
};
