import 'expo-router/entry';

import { Platform } from 'react-native';

// El widget de la pantalla de inicio se pinta desde una tarea en segundo plano de Android.
if (Platform.OS === 'android') {
  const { registerWidgetTaskHandler } = require('react-native-android-widget');
  registerWidgetTaskHandler(require('./src/widget').widgetTaskHandler);
}
