function setupSecrets() {
  const scriptProperties = PropertiesService.getScriptProperties();
  
  // Replace with your actual values
  scriptProperties.setProperties({
    'SHEET_ID': '',  // Your real sheet ID
    'LLM_API_KEY': '',  // Your real LLM API key
    'LLM_API_ENDPOINT': '', // Your real LLM API endpoint
    'FMP_API_KEY': '', // Your real FinancialModelingPrep API key
    'FMP_API_URL': '' // Your real FinancialModelingPrep API url
  });
  
  console.log('Secrets stored successfully!');
}

function viewSecrets() {
  const props = PropertiesService.getScriptProperties();
  const allProps = props.getProperties();
  console.log(allProps); // Shows keys but not values in logs
}

function getSecret(key) {
  const scriptProperties = PropertiesService.getScriptProperties();
  const value = scriptProperties.getProperty(key);
  
  if (!value) {
    throw new Error(`Secret '${key}' not found. Run setupSecrets() first.`);
  }
  
  return value;
}
