import { Alert } from './dialog';

// Ask "are you sure?" and only run onConfirm if they agree. Works on
// web (in-app dialog), Android and iOS.
export function confirmAction(opts: {
  title: string;
  message: string;
  confirmText: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel?: () => void;
}) {
  const { title, message, confirmText, destructive = true, onConfirm, onCancel } = opts;
  Alert.alert(title, message, [
    { text: 'Cancel', style: 'cancel', onPress: onCancel },
    { text: confirmText, style: destructive ? 'destructive' : 'default', onPress: onConfirm },
  ]);
}
