import React from 'react';
import AppNavigator from './src/navigation/AppNavigator';
import { JogQuestAlertProvider } from './src/components/JogQuestAlert';

const App = () => {
  return (
    <JogQuestAlertProvider>
      <AppNavigator />
    </JogQuestAlertProvider>
  )
};

export default App;