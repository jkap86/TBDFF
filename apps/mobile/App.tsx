import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import Constants from 'expo-constants';
import { initApiClient } from '@tbdff/shared';
import { AuthProvider } from './src/features/auth/context/AuthContext';
import AppNavigator from './src/navigation/AppNavigator';

initApiClient({
  baseUrl: Constants.expoConfig?.extra?.apiUrl || 'http://localhost:5000/api',
});

export default function App() {
  return (
    <AuthProvider>
      <NavigationContainer>
        <AppNavigator />
        <StatusBar style="auto" />
      </NavigationContainer>
    </AuthProvider>
  );
}
