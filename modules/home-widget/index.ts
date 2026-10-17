import { requireOptionalNativeModule } from 'expo';
import { Platform } from 'react-native';

type HomeWidgetModule = {
  /** Stores the widgets' data (JSON) and redraws every placed widget. */
  update(json: string): void;
};

/** Android home screen widgets; null on iOS, web and in Expo Go, which lack the native code. */
export default Platform.OS === 'android'
  ? requireOptionalNativeModule<HomeWidgetModule>('HomeWidget')
  : null;
