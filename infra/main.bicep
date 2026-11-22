// Plató · recurso de Microsoft Foundry con los modelos del prototipo.
// Solo Entra ID (sin claves): la app local usa tu sesión de Azure CLI.
targetScope = 'resourceGroup'

@description('Región del recurso. Sweden Central tiene todos los modelos del prototipo salvo Kling.')
param location string = 'swedencentral'

@description('Nombre del recurso de Foundry (también su subdominio).')
param accountName string = 'plato-${uniqueString(resourceGroup().id)}'

@description('Object ID de quien usará la app en local (recibe Cognitive Services User).')
param principalId string

@allowed(['User', 'ServicePrincipal', 'Group'])
param principalType string = 'User'

param tags object = {
  project: 'plato'
  'created-by': 'copilot'
}

@description('Capacidad (miles de TPM) de los modelos GPT.')
param gptCapacity int = 200

resource account 'Microsoft.CognitiveServices/accounts@2026-09-01' = {
  name: accountName
  location: location
  kind: 'AIServices'
  sku: { name: 'S0' }
  identity: { type: 'SystemAssigned' }
  tags: tags
  properties: {
    customSubDomainName: accountName
    publicNetworkAccess: 'Enabled'
    disableLocalAuth: true
    allowProjectManagement: true
  }
}

// Los despliegues de una misma cuenta se crean de uno en uno (dependsOn encadenado).
resource decision 'Microsoft.CognitiveServices/accounts/deployments@2026-09-01' = {
  parent: account
  name: 'decision-1-1'
  sku: { name: 'GlobalStandard', capacity: 500 }
  properties: {
    model: { format: 'Microsoft', name: 'Microsoft-Decision-1.1', version: '1' }
  }
}

resource luna 'Microsoft.CognitiveServices/accounts/deployments@2026-09-01' = {
  parent: account
  name: 'gpt-6-luna'
  sku: { name: 'GlobalStandard', capacity: gptCapacity }
  properties: {
    model: { format: 'OpenAI', name: 'gpt-6-luna', version: '2026-09-22' }
  }
  dependsOn: [decision]
}

resource astra 'Microsoft.CognitiveServices/accounts/deployments@2026-09-01' = {
  parent: account
  name: 'gpt-6-2-astra'
  sku: { name: 'GlobalStandard', capacity: gptCapacity }
  properties: {
    model: { format: 'OpenAI', name: 'gpt-6.2-astra', version: '2026-11-17' }
  }
  dependsOn: [luna]
}

resource image 'Microsoft.CognitiveServices/accounts/deployments@2026-09-01' = {
  parent: account
  name: 'mai-image-2-7'
  sku: { name: 'GlobalStandard', capacity: 2 }
  properties: {
    model: { format: 'Microsoft', name: 'MAI-Image-2.7', version: '2026-11-02' }
  }
  dependsOn: [astra]
}

resource minimax 'Microsoft.CognitiveServices/accounts/deployments@2026-09-01' = {
  parent: account
  name: 'fal-minimax-h3-max'
  sku: { name: 'GlobalStandard', capacity: 2 }
  properties: {
    model: { format: 'fal.ai', name: 'Fal-MiniMax-H3-Max', version: '2026-11-02' }
  }
  dependsOn: [image]
}

resource ltx 'Microsoft.CognitiveServices/accounts/deployments@2026-09-01' = {
  parent: account
  name: 'fal-ltx-2-5-fast'
  sku: { name: 'GlobalStandard', capacity: 2 }
  properties: {
    model: { format: 'fal.ai', name: 'Fal-LTX-2.5-Fast', version: '2026-11-02' }
  }
  dependsOn: [minimax]
}

// Cognitive Services User: acciones de datos sobre todos los modelos de la cuenta.
resource userRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(account.id, principalId, 'a97b65f3-24c7-4388-baec-2e87135dc908')
  scope: account
  properties: {
    principalId: principalId
    principalType: principalType
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', 'a97b65f3-24c7-4388-baec-2e87135dc908')
  }
}

output accountName string = account.name
output endpoint string = 'https://${account.name}.services.ai.azure.com'
output cognitiveEndpoint string = 'https://${account.name}.cognitiveservices.azure.com'
output openaiEndpoint string = 'https://${account.name}.openai.azure.com'
output deployments object = {
  decision: decision.name
  fast: luna.name
  deep: astra.name
  image: image.name
  videoRef: minimax.name
  videoDraft: ltx.name
}
