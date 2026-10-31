import { AuthForm } from '@/components/auth-form';
import { Screen } from '@/components/ui';

/** The only screen open while signed out: the root layout guards every other one. */
export default function SignInScreen() {
  return (
    <Screen title="GetFit" mode="root">
      <AuthForm />
    </Screen>
  );
}
