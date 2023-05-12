const formContainer = $('#form-container')
const previewContainer = $('#preview-container')
const oldMessages = []
var globalForm = null
var OPENAI_API_KEY = promptOpenAIAPIKey()

$(async () => {
  // Fetch the form metadata from the server
  globalForm = await fetchFormMetadata()
  // Render the form
  createForm(globalForm)
  // Generate the deck preview whenever the form is updated
  formContainer.on('change', () => { generatePreview(globalForm) })
  // Instantiate the chatbot
  initializeChatbot()
})

/** 
 * Fetches the form metadata from the server.
 * @returns {Promise<Form>} The form metadata.
 */
async function fetchFormMetadata() {
  const response = await fetch('/form.json')
  return response.json()
}
/** 
 * Creates the form HTML.
 * @param {Form} form The form metadata.
 * @returns {string} The form HTML.
*/
function createForm(form) {
  // Loop through the 'form' array and create form elements
  for (let i = 0; i < form.form.length; i++) {
    const field = form.form[i]
    // Create a label element for the field
    const label = $('<label></label>')
    label.attr('for', field.name)
    label.text(field.title)
    // Create an input element based on the field type
    let input
    switch (field.type) {
      case 'text':
        input = $("<input>").attr({
          type: "text",
          name: field.name
        })
        break
      case 'textarea':
        input = $('<textarea>').attr('name', field.name)
        break
      // Handle other field types as needed
    }
    // Add a placeholder and/or default value if specified in the metadata
    if (field.placeholder) {
      $(input).attr('placeholder', field.placeholder)
    }
    if (field.defaultValue) {
      $(input).attr('value', field.defaultValue)
    }
    $(input).addClass('form-control')
    // Create a div element to contain the label and input elements
    const fieldContainer = $('<div>')
    fieldContainer.append(label)
    fieldContainer.append(input)
    // Add the field container to the form container
    formContainer.append(fieldContainer)
  }
}

/** 
* Generates the deck preview.
* @param {Form} form The form metadata.
*/
function generatePreview(form) {
  if (!form) return

  // Get the user input values from the form
  const valueArray = formContainer.serializeArray()
  const values = valueArray.reduce((obj, item) => {
    obj[item.name] = item.value || ''
    return obj
  }, {})

  let previewHtml = `
    <h1>${values.companyName}</h1>
    <h2>${values.tagline}</h2>
    </hr>
  `
  previewHtml += form.form.reduce((acc, item) => {
    return acc + `<h3>${item.title}:</h3><p>${values[item.name]}</p>`
  }, '')

  // Clear the existing preview
  previewContainer.empty()
  // Add the generated deck preview to the preview container
  previewContainer.append(previewHtml)
}


/** 
* Instantiates the chatbot.
* @param {Form} form The form metadata.
*/
function initializeChatbot() {
  // handle user input
  $('.chatbot-input input').on('keypress', function(e) {
    if (e.which == 13) {
      // extract message
      var message = $(this).val()
      // clear input
      $(this).val('')
      // send message
      sendMessage(message)
    }
  })
  $('.chatbot-input button').on('click', function(e) {
    // extract message
    var message = $('.chatbot-input input').val()
    // clear input
    $('.chatbot-input input').val('')
    // send message
    sendMessage(message)
  })
}

/**
 * Sets the UI state to loading.
 * @param {boolean} loading
 */
function setLoading(loading) {
  if (loading) {
    $('.spinner-border').removeClass('d-none')
    $('.submit').addClass('d-none')
  }
  else {
    $('.spinner-border').addClass('d-none')
    $('.submit').removeClass('d-none')
  }
}

/**
 * Here's tha magic of this prototype.
 * Interacts with OpenAI's API and handles the response.
 * @param {string} message The user's message.
 * @returns {string} The chatbot's response.
 */
async function askGPT(message) {
  // send message to chatGPT's AP
  // send the text to openai's API
  const newMessage = {
    'role': 'user',
    'content': message
  }
  const messages = [generateSystemMessage()].concat(oldMessages.concat([newMessage]))

  const res = await $.ajax({
    url: 'https://api.openai.com/v1/chat/completions',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
    },
    data: JSON.stringify({
      'model': 'gpt-4',
      messages
    })
  })
  const response = res.choices[0].message.content

  oldMessages.push(newMessage)
  oldMessages.push({
    'role': 'assistant',
    'content': response
  })

  const responseObject = JSON.parse(response)

  // if the response has changes to the form, update the form
  if (responseObject.changes && responseObject.changes.length) {
    let res = `${responseObject.message} `
    responseObject.changes.forEach(change => {
      setFormValue(change.field, change.newValue)
      res += `<br><b>${change.field}</b>: ${change.newValue}`

    })
    return res
  }

  return responseObject.message
}

/** 
* Creates a text summary of the form so ChatGPT can interpret it.
* @param {Form} form The form metadata.
* @paarm {Object} The formContainer.
* @returns {string} The summary of the form.
*/
function summarizeForm(form, formContainer) {
  if (!form) return

  // Get the user input values from the form
  const valueArray = formContainer.serializeArray()
  const values = valueArray.reduce((obj, item) => {
    obj[item.name] = item.value || ''
    return obj
  }, {})

  let summary = `
    ${values.companyName}
    ${values.tagline}
    
  `
  summary += form.form.reduce((acc, item) => {
    if (!values[item.name]) return acc

    return acc + `${item.title}: ${values[item.name]}. `
  }, '')

  return summary
}

/** 
* Generates the initial system message, which changes with the form to reduce the number of messages sent to the API.
* @returns {string} The system message.
*/
function generateSystemMessage() {
  const fields = globalForm.form.map((item) => { return item.name }).join(',')
  return {
    role: 'system',
    content: 'You are a pitch deck specialist AI. Help perfect this pitch deck: ' + summarizeForm(globalForm, formContainer) +
      'You only respond in JSON format: {message: "", changes: [field: "", newValue: ""]}. Field is one of:' + fields + '. If no field needs to be updated skip field and newValue.'
  }
}

/** 
* Sets a value on the form.
* @param {string} name The name of the field.
* @param {string} value The value to set.
*/
function setFormValue(field, newValue) {
  console.log('Setting... ', field, newValue)
  $('[name="' + field + '"]').val(newValue)
  $('[name="' + field + '"]').change()
}

/** 
* Asks the user for an OpenAI API key.
* @param {string} default value used for testing.
* @returns {string} The user's API key.
*/
function promptOpenAIAPIKey(defaultValue) {
  let apiKey = null
  // if the user has already set the API key, skip the prompt
  if (localStorage.getItem('openai_api_key')) {
    apiKey = localStorage.getItem('openai_api_key')
  } else {
    // prompt the user for the API key
    apiKey = prompt('Please enter your OpenAI API Key', defaultValue)
    localStorage.setItem('openai_api_key', apiKey)
  }
  return apiKey
}

/** 
* Handles user messages on the chat bot.
* @param {string} message The user's message.
*/
async function sendMessage(message) {
  // append message to chatbot
  $('.chatbot-messages').append(`
          <div class="chatbot-message chatbot-message-user">
            <div class="chatbot-message-text">
              <p>${message}</p>
            </div>
          </div>
        `)
  try {
    setLoading(true)
    // get response from chatbot
    const response = await askGPT(message, globalForm)

    // append message to chatbot
    $('.chatbot-messages').append(`
        <div class="chatbot-message chatbot-message-chatbot">
          <div class="chatbot-message-text">
            <p>${response}</p>
          </div>
        </div>
      `)
    setLoading(false)
  }
  catch (error) {
    console.error(error)
    // append message to chatbot
    $('.chatbot-messages').append(`
        <div class="chatbot-message chatbot-message-chatbot">
          <div class="chatbot-message-text">
            <p>ERROR: ${error.message}</p>
          </div>
        </div>
      `)
    setLoading(false)
  }
}