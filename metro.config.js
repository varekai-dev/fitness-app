const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
config.resolver.sourceExts.push('sql');

// expo-notifications requires its FCM topic module at import time, and Expo Go on
// Android doesn't ship it, so the whole app would crash there. The app only uses
// local notifications, never topics, so the no-op web stub stands in everywhere.
const topicStub = path.join(
  path.dirname(require.resolve('expo-notifications/package.json')),
  'build/TopicSubscriptionModule.js',
);
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (
    moduleName === './TopicSubscriptionModule' &&
    context.originModulePath.includes(`expo-notifications${path.sep}build`)
  ) {
    return { type: 'sourceFile', filePath: topicStub };
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
