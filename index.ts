import { registerRootComponent } from 'expo';

// Must precede ./App: sets the native RTL flag before App's module body
// (Uniwind.setTheme) and before the first render.
import './src/i18n/rtl-bootstrap';
import App from './App';

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
