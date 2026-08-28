export type MobileFeature = 'camera' | 'microphone' | 'location' | 'notifications' | 'biometrics' | 'file_system';

export function createMobileCompatibilityPlan(webCapabilities: string[], nativeImplementations: Partial<Record<MobileFeature, string>>) {
  const nativeFeatures = webCapabilities.filter((capability): capability is MobileFeature => ['camera', 'microphone', 'location', 'notifications', 'biometrics', 'file_system'].includes(capability));
  const missing = nativeFeatures.filter((feature) => !nativeImplementations[feature]);
  return { compatible: missing.length === 0, missing, implementations: nativeFeatures.map((feature) => ({ feature, module: nativeImplementations[feature] ?? null })) };
}

export function validateMobileBuild(input: { platform: 'ios' | 'android'; artifactId?: string; isWebView: boolean; scenariosPassed: string[] }) {
  const reasons: string[] = [];
  if (input.isWebView) reasons.push('webview_is_not_native');
  if (!input.artifactId) reasons.push('versioned_artifact_required');
  if (!input.scenariosPassed.includes('C9')) reasons.push('mobile_scenario_c9_required');
  return { releasable: reasons.length === 0, reasons };
}
