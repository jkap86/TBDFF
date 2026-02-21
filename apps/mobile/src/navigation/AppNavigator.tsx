import { ActivityIndicator, View } from 'react-native';
import { useAuth } from '../features/auth/context/AuthContext';
import AuthNavigator from '../features/auth/navigation/AuthNavigator';
import MainNavigator from './MainNavigator';

export default function AppNavigator() {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return isAuthenticated ? <MainNavigator /> : <AuthNavigator />;
}
