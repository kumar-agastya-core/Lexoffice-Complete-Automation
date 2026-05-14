
Search
Lexware API Documentation
API Rate Limits
Articles Endpoint
Purpose
Article Properties
Create an Article
Retrieve an Article
Update an Article
Delete an Article
Filtering Articles
Contacts Endpoint
Countries Endpoint
Credit Notes Endpoint
Delivery Notes Endpoint
Dunnings Endpoint
Down Payment Invoices Endpoint
Event Subscriptions Endpoint
Files Endpoint
Invoices Endpoint
Order Confirmations Endpoint
Payments Endpoint
Payment Conditions Endpoint
Posting Categories Endpoint
Print Layouts Endpoint
Profile Endpoint
Quotations Endpoint
Recurring Templates Endpoint
Voucherlist Endpoint
Vouchers Endpoint
Paging of Resources
Optimistic Locking
HTTP Status Codes
Error Codes
FAQ
Samples
Change Log
API License and Terms of Use
Terms of Service (AGB)
Privacy Statement
Impressum – Legal Notice
Contact
Lexware API Documentation
This documentation describes the set-up process, where to start with the API and the currently available endpoints. It moreover provides samples and suggestions on how to get the best out of the API.

Based on our rebranding from lexoffice to Lexware the domains of our app, the API gateway has been changed on 26 May 2025. Please find here the new API Gateway URL for our production system: https://api.lexware.io. We keep the access to the previously used API Gateway URL available until December 2025.
Nevertheless, for all productive integrations and integrations under development, please use the new URL as soon as possible.
Introduction
The Lexware API is a REST API that allows developers to incorporate Lexware into their applications by pushing and pulling data from and to Lexware. Examples for this data are contact information and e.g. scanned images for bookkeeping vouchers (referred to as "files"). The responses of the endpoints are formatted in JSON.

The Lexware API endpoints are exposed by a gateway located at https://api.lexware.io. In the request examples throughout this documentation, we use placeholder variables {appbaseurl} to refer to the Lexware application url, {resourceurl} to refer to the resource urls of the Lexware API endpoints and {accessToken} to refer to the API key. We also use access token and API key interchangeably.

Users of the Lexware API can generate their private API key at https://app.lexware.de/addons/public-api.

Additionally to this reference documentation, various cookbooks – Lexware API Kochbücher – are available in German. They describe the concepts of aspects of the API from a high level perspective and are helpful as recipes for the implementation of Lexware integrations.

API Rate Limits
Lexware intends to provide a responsible API for a broad range of use cases to an equally broad range of API users. To make sure the API is responsive for everyone, a cap of the number of requests is in place.

The Lexware API uses the token bucket algorithm to maintain a stable rate of requests against the resource endpoints. Our limits refer to all endpoints of the Lexware API at the same time.

A client can make up to 2 requests per second to the Lexware API.

Please note that these limits may be changed on short notice if the load created by API users exceeds the available resources for a continued amount of time.
Hitting the Rate Limits
If the rate of incoming requests exceeds the available limits, an HTTP response code 429 will be returned, and the actual call will not be performed.

Dealing with Rate Limits
Your implementation should make sure that our limits are not hit constantly, and that outgoing requests do not regularly exceed the provided limits. This can be obtained through various methods:

Recommended: Use the token bucket algorithm on your side. Librarys for all major programming languages exist.
Use a trivial "sleep" call between consecutive calls
Make sure that the response code 429 is handled appropriately, usually by retrying the call at a later time, possibly using exponential backoff
Please note that various layers of network infrastructure on your side, in "the internet", and on our side will result in jitter of request timing. Enforcing the mentioned limits without any buffer will commonly result in rate limited requests.

Rate Limits for Authorization Server
The authorization server has its own rate limits, which are independent of the API rate limits for the resource endpoints. The rate limits are not publicly documented, but if you follow the guidelines above, you should not run into issues.

If your client is blocked due to too many requests, you will receive an HTTP response code 429 and the client will be blocked for a certain time, ranging from a few seconds to a few minutes, depending on the number of requests that were sent in a short time frame.

However, if the client does not reduce the number of requests, it will stay blocked permanently until the number of requests is reduced.

Articles Endpoint
Purpose
The articles endpoint provides read and write access to articles in Lexware. These articles can be used in line items of sales vouchers such as invoices or quotations.

Article Properties
Sample of an article

{
  "id": "eb46d328-e1dc-11ee-8444-2fadfc15a567",
  "organizationId": "9e700f44-0c55-11ef-ac31-8f7c36d1b6e2",
  "createdDate": "2023-09-21T17:46:40.629+02:00",
  "updatedDate": "2024-05-03T12:21:32.120+02:00",
  "archived": false,
  "title": "Lexware buchhaltung Premium 2024",
  "description": "Monatsabonnement. Mehrplatzsystem zur Buchhaltung. Produkt vom Marktführer. PC Aktivierungscode per Email",
  "type": "PRODUCT",
  "articleNumber": "LXW-BUHA-2024-001",
  "gtin": "9783648170632",
  "note": "Interne Notiz",
  "unitName": "Download-Code",
  "price": {
    "netPrice": 61.90,
    "grossPrice": 73.66,
    "leadingPrice": "NET",
    "taxRate": 19
  },
  "version": 2
}
  Property	Description
id
uuid	Unique id of the article generated on creation by Lexware.
organizationId
uuid	Unique id of the organization the article belongs to.
createdDate
dateTime	The instant of time when the article was created by Lexware in format yyyy-MM-ddTHH:mm:ss.SSSXXX as described in RFC 3339/ISO 8601 (e.g. 2023-02-21T00:00:00.000+01:00).
Read-only.
updatedDate
dateTime	The instant of time when the article was updated by Lexware in format yyyy-MM-ddTHH:mm:ss.SSSXXX as described in RFC 3339/ISO 8601 (e.g. 2023-02-21T00:00:00.000+01:00).
Read-only.
archived
boolean	Archived flag of the article.
Read-only.
title
string	Title of the article.
description
string	Description of the article.
type
enum	Type of the article. Possible values are PRODUCT and SERVICE.
articleNumber
string	The article number as given by the user.
gtin
string	Global Trade Item Number (GTIN) of the article. If given, the value will be validated to match one of the GTIN-8, GTIN-12, GTIN-13, or GTIN-14 formats.
note
string	Internal note for the article.
unitName
string	Unit name of the article.
price
object	Price of the article.
version
integer	Version (revision) number which will be increased on each change to handle optimistic locking.
Read-only.
Price object details

  Property	Description
netPrice
number	The net price of the article. Read-only, if the leadingPrice is GROSS.
grossPrice
number	The gross price of the article. Read-only, if the leadingPrice is NET.
leadingPrice
enum	The leading price type. Possible values are NET and GROSS. For read access, this value reflects the price that was last set in Lexware, or the leadingPrice value of the last API write operation. For write access, it reflects which price is passed by the client; the other price one will be calculated based on the leading price and the given tax rate.
taxRate
number	The tax rate applied to the article price. As of March 2024, possible values are 0, 7, and 19.
Create an Article
Sample request to create an article

curl https://api.lexware.io/v1/articles
-X POST
-H "Authorization: Bearer {accessToken}"
-H "Content-Type: application/json"
-H "Accept: application/json"
-d '
{
  "title": "Lexware buchhaltung Premium 2024",
  "type": "PRODUCT",
  "unitName": "Download-Code",
  "articleNumber": "LXW-BUHA-2024-001",
  "price": {
    "netPrice": 61.90,
    "leadingPrice": "NET",
    "taxRate": 19
  }
}'
POST {resourceurl}/v1/articles

The contents of the article are expected in the request’s body as an application/json.

Description of required properties when creating an article:

 Property	Required	Notes
title	Yes	
type	Yes	
unitName	Yes	
price	Yes	Nested object, see below.
Price Required Properties

 Property	Required	Notes
netPrice	*	Required if leadingPrice is NET
grossPrice	*	Required if leadingPrice is GROSS
leadingPrice	Yes	
taxRate	Yes	
Sample response

{
    "id": "f5d5e4c2-e20a-11ee-9cde-7789c0d1fa1c",
    "resourceUri": "https://api.lexware.io/v1/articles/f5d5e4c2-e20a-11ee-9cde-7789c0d1fa1c",
    "createdDate": "2024-03-14T14:58:10.320+01:00",
    "updatedDate": "2024-03-14T14:58:10.320+01:00",
    "version": 0
}

Retrieve an Article
Sample request

curl https://api.lexware.io/v1/articles/f5d5e4c2-e20a-11ee-9cde-7789c0d1fa1c
-X GET
-H "Authorization: Bearer {accessToken}"
-H "Accept: application/json"
Sample response

{
  "id": "eb46d328-e1dc-11ee-8444-2fadfc15a567",
  "title": "Lexware buchhaltung Premium 2024",
  "description": "Monatsabonnement. Mehrplatzsystem zur Buchhaltung. Produkt vom Marktführer. PC Aktivierungscode per Email",
  "type": "PRODUCT",
  "articleNumber": "LXW-BUHA-2024-001",
  "gtin": "9783648170632",
  "note": "Interne Notiz",
  "unitName": "Download-Code",
  "price": {
    "netPrice": 61.90,
    "grossPrice": 73.66,
    "leadingPrice": "NET",
    "taxRate": 19
  },
  "version": 0
}
GET {resourceurl}/v1/articles/{id}

Returns the article with id value {id}.

Update an Article
PUT {resourceurl}/v1/articles/{id}

Sample request to update an existing article

curl https://api.lexware.io/v1/articles/eb46d328-e1dc-11ee-8444-2fadfc15a567
-X PUT
-H "Authorization: Bearer {accessToken}"
-H "Content-Type: application/json"
-H "Accept: application/json"
-d '
{
  "title": "Lexware buchhaltung Premium 2024",
  "description": "Monatsabonnement. Mehrplatzsystem zur Buchhaltung. Produkt vom Marktführer. PC Aktivierungscode per Email",
  "type": "PRODUCT",
  "articleNumber": "LXW-BUHA-2024-001",
  "gtin": "9783648170632",
  "note": "Internal note",
  "unitName": "Download-Code",
  "price": {
    "netPrice": 61.90,
    "grossPrice": 73.66,
    "leadingPrice": "NET",
    "taxRate": 19
  },
  "version": 1
}
'
Sample response

{
  "id": "eb46d328-e1dc-11ee-8444-2fadfc15a567",
  "resourceUri": "https://api.lexware.io/v1/articles/eb46d328-e1dc-11ee-8444-2fadfc15a567",
  "createdDate": "2024-03-14T14:58:10.320+01:00",
  "updatedDate": "2024-04-29T16:12:09.512+02:00",
  "version": 2
}
Update an existing article with id {id} with the data given in the payload as JSON. Returns an action result on success.

For information about required fields please see Create an article.

Delete an Article
DELETE {resourceurl}/v1/articles/{id}

Deletes the article with id value {id}.

Returns 204 on success, or 404 if the id does not exist.

Filtering Articles
GET {resourceurl}/v1/articles?filter_1=value_1&...&filter_n=value_n

Sample request for retrieving all articles

curl https://api.lexware.io/v1/articles?page=0
-X GET
-H "Authorization: Bearer {accessToken}"
-H "Accept: application/json"
Sample response

{
    "content": [
      {
        "id": "eb46d328-e1dc-11ee-8444-2fadfc15a567",
        "title": "Lexware buchhaltung Premium 2024",
        "description": "Monatsabonnement. Mehrplatzsystem zur Buchhaltung. Produkt vom Marktführer. PC Aktivierungscode per Email",
        "type": "PRODUCT",
        "articleNumber": "LXW-BUHA-2024-001",
        "gtin": "9783648170632",
        "note": "Interne Notiz",
        "unitName": "Download-Code",
        "price": {
          "netPrice": 61.90,
          "grossPrice": 73.66,
          "leadingPrice": "NET",
          "taxRate": 19
        },
        "version": 1
      },
      {
        "id": "f7e14ba6-e2ac-11ee-96c1-3b561501789e",
        "title": "Lexware warenwirtschaft Premium 2024",
        "description": "Monatsabonnement. Mehrplatzsystem zur kompletten Warenwirtschaft. Produkt vom Marktführer. PC Aktivierungscode per Email",
        "type": "PRODUCT",
        "articleNumber": "LXW-WAWI-2024-001",
        "gtin": "9783648170779",
        "note": "Interne Notiz",
        "unitName": "Download-Code",
        "price": {
          "netPrice": 61.90,
          "grossPrice": 73.66,
          "leadingPrice": "NET",
          "taxRate": 19
        },
        "version": 3
      }
    ],
    "totalPages": 1,
    "totalElements": 2,
    "last": true,
    "sort": [
      {
          "direction": "ASC",
          "property": "title",
          "ignoreCase": false,
          "nullHandling": "NATIVE",
          "ascending": true
      }
    ],
    "size": 25,
    "number": 0,
    "first": true,
    "numberOfElements": 2
}
Returns the articles that fulfill the criteria given by filters filter_1 to filter_n using a paging mechanism. If more than one filter is given, the logical connector is AND. Filters that are not set are ignored. To check the maximum page size for this endpoint, see Paging of Resources.

Note that a filter should not be present more than once in a request.

The following table describes the possible filter parameters.

Parameter	Description
articleNumber
string	Returns the article with the given article number in a page element, or an empty page otherwise.
gtin
string	Returns a page of articles with the given GTIN
type
enum	Filters by the given type. Possible values are PRODUCT and SERVICE.
Contacts Endpoint
Purpose
This endpoint provides read access to contacts (e.g. customers, vendors). A contact can hold addresses, contact information (e.g. phone numbers, email addresses) and contact persons for company related contacts. It is also possible to use filters on the contacts collection.

Contact Properties
Sample of a contact with roles customer and vendor

{
    "id": "be9475f4-ef80-442b-8ab9-3ab8b1a2aeb9",
    "organizationId": "aa93e8a8-2aa3-470b-b914-caad8a255dd8",
    "version": 1,
    "roles": {
        "customer": {
            "number": 10307
        },
        "vendor": {
            "number": 70303
        }
    },
    "company": {
        "name": "Testfirma",
        "taxNumber": "12345/12345",
        "vatRegistrationId": "DE123456789",
        "allowTaxFreeInvoices": true,
        "contactPersons": [
            {
                "salutation": "Herr",
                "firstName": "Max",
                "lastName": "Mustermann",
                "primary": true,
                "emailAddress": "contactpersonmail@lexware.de",
                "phoneNumber": "08000/11111"
            }
        ]
    },
    "addresses": {
        "billing": [
            {
                "supplement": "Rechnungsadressenzusatz",
                "street": "Hauptstr. 5",
                "zip": "12345",
                "city": "Musterort",
                "countryCode": "DE"
            }
        ],
        "shipping": [
            {
                "supplement": "Lieferadressenzusatz",
                "street": "Schulstr. 13",
                "zip": "76543",
                "city": "MUsterstadt",
                "countryCode": "DE"
            }
        ]
    },
    "xRechnung": {
        "buyerReference": "04011000-1234512345-35",
        "vendorNumberAtCustomer": "70123456"
    },
    "emailAddresses": {
        "business": [
            "business@lexware.de"
        ],
        "office": [
            "office@lexware.de"
        ],
        "private": [
            "private@lexware.de"
        ],
        "other": [
            "other@lexware.de"
        ]
    },
    "phoneNumbers": {
        "business": [
            "08000/1231"
        ],
        "office": [
            "08000/1232"
        ],
        "mobile": [
            "08000/1233"
        ],
        "private": [
            "08000/1234"
        ],
        "fax": [
            "08000/1235"
        ],
        "other": [
            "08000/1236"
        ]
    },
    "note": "Notizen",
    "archived": false
}
                    Property	Description
id
uuid	Unique id of the contact generated on creation by Lexware.
organizationId
uuid	Unique id of the organization the contact belongs to.
version
integer	Version (revision) number which will be increased on each change to handle optimistic locking.
Read-only.
roles
object	Defines contact roles and supports further contact information. For object details see below.
company
object	Company related information. For details see below.
person
object	Individual person related information. For details see below.
addresses
object	Addresses (e.g. billing and shipping address(es)) for the contact. Contains a list for each address type. For details see below.
xRechnung
object	XRechnung related properties of the contact
emailAddresses
object	Email addresses for the contact. Contains a list for each email type in Lexware. For details see below.
phoneNumbers
object	Phone numbers for the contact. Contains a list for each phone number type in Lexware. For details see below.
note
string	A note to the contact with a maximum length of 1000 characters. This is just additional information.
archived
boolean	Archived flag of the contact.
Read-only.
Roles Details

Contains a customer and/or a vendor object. The presence of a role in the JSON implies that the contact will have this role. For example, if the customer object is present, the contact has the role customer. Please note that each contact must have at least one role.

                    Property	Description
customer
object	May be present. If present the created contact has the role customer.
vendor
object	May be present. If present the created contact has the role vendor.
Customer Details

                    Property	Description
number
integer	Unique customer number within the current organization. This number is created by Lexware for contacts with role Customer. It cannot be set during creation and cannot be changed.
Read-only.
Vendor Details

                    Property	Description
number
integer	Unique vendor number within the current organization. This number is created by Lexware for contacts with role Vendor. It cannot be set during creation and cannot be changed.
Read-only.



Company Details

Use this object to provide information for a contact of type company.

                    Property	Description
allowTaxFreeInvoices
boolean	Possible values are true or false.
name
string	Company name
taxNumber
string	Tax number for this company --> "Steuernummer".
vatRegistrationId
string	Vat registration id for this company. This id has to follow the german rules for the vat registration ids --> "Umsatzsteuer ID".
contactPersons
list	A list of company contact persons. Each entry is an object of company contact person. Details of nested object please see below.
Company Contact Person Details

Please note that it's only possible to create and change contacts with a maximum of one contact person. It's possible to retrieve contacts with more than one contact person, but it's not possible to update such a contact via the REST API.
                    Property	Description
salutation
string	Salutation for the contact person with max length of 25 characters.
firstName
string	First name of the contact person.
lastName
string	Last name of the contact person.
primary
boolean	Flags if contact person is the primary contact person. Primary contact persons are shown on vouchers. Default is false.
emailAddress
string	Email address of the contact person.
phoneNumber
string	Phone number of the contact person.



Person Details

Sample json for a contact of type private person

{
  "id": "e9066f04-8cc7-4616-93f8-ac9ecc8479c8",
  "organizationId": "aa93e8a8-2aa3-470b-b914-caad8a255dd8",
  "version": 0,
  "roles": {
    "customer": {
      "number": 10308
    }
  },
  "person": {
    "salutation": "Frau",
    "firstName": "Inge",
    "lastName": "Musterfrau"
  },
  "archived": false
}
Use this object to provide information for a contact of type private person.

                    Property	Description
salutation
string	Salutation for the individual person with max length of 25 characters.
firstName
string	First name of the person.
lastName
string	Last name of the person.



Addresses Details

Use this objects to provide billing and shipping information of a contact.

Please note that it's only possible to create and change contacts with a maximum of one billing and/or one shipping address. It's possible to retrieve contacts with more than one billing and shipping address, but it's not possible to update such a contact via the REST API.
                    Property	Description
billing
list	A list of billing addresses. Each entry is an object of address.
shipping
list	A list of shipping addresses. Each entry is an object of address.
Address Details

                    Property	Description
supplement
string	Additional address information.
street
string	Street with Street number.
zip
string	Zip code
city
string	City
countryCode
string	Country code in the format of ISO 3166 alpha2 (e.g. DE is used for germany).



XRechnung Details

Contacts for German public authorities should be created with both of the following attributes set. This results in the generation of invoice documents conforming to the German XRechnung standard when creating invoices in Lexware.
If a customer's buyerReference is set, its vendorNumberAtCustomer needs to be set as well.

                    Property	Description
buyerReference
string	Customer's Leitweg-ID conforming to the German XRechnung system
vendorNumberAtCustomer
string	Your vendor number as used by the customer



E-Mail Addresses Details

Please note that it's only possible to create and change contacts with a maximum of one entry in each of the below described lists. It's possible to retrieve contacts with more than one entry in the lists, but it's not possible to update such a contact via the REST API.
                    Property	Description
business
list	A list of email addresses. Each entry is of type string and contains an email address.
office
list	A list of email addresses. Each entry is of type string and contains an email address.
private
list	A list of email addresses. Each entry is of type string and contains an email address.
other
list	A list of email addresses. Each entry is of type string and contains an email address.



Phone Numbers Details

Please note that it's only possible to create and change contacts with a maximum of one entry in each of the below described lists. It's possible to retrieve contacts with more than one entry in the lists, but it's not possible to update such a contact via the REST API.
                    Property	Description
business
list	A list of phone numbers. Each entry is of type string and contains a phone number.
office
list	A list of phone numbers. Each entry is of type string and contains a phone number.
mobile
list	A list of phone numbers. Each entry is of type string and contains a phone number.
private
list	A list of phone numbers. Each entry is of type string and contains a phone number.
fax
list	A list of phone numbers. Each entry is of type string and contains a phone number.
other
list	A list of phone numbers. Each entry is of type string and contains a phone number.
Create a Contact
Sample request to create a customer

curl https://api.lexware.io/v1/contacts
-X POST
-H "Authorization: Bearer {accessToken}"
-H "Content-Type: application/json"
-H "Accept: application/json"
-d '
{
  "version": 0,
  "roles": {
    "customer": {
    }
  },
  "person": {
     "salutation": "Frau",
     "firstName": "Inge",
     "lastName": "Musterfrau"
  },
  "note": "Notizen"
}'
Sample response

{
  "id": "66196c43-baf3-4335-bfee-d610367059db",
  "resourceUri": "https://api.lexware.io/v1/contacts/66196c43-bfee-baf3-4335-d610367059db",
  "createdDate": "2023-06-29T15:15:09.447+02:00",
  "updatedDate": "2023-06-29T15:15:09.447+02:00",
  "version": 1
}
POST {resourceurl}/v1/contacts

The contents of the contact are expected in the request’s body as an application/json.

Description of required properties when creating a customer.

                    Property	Required	Notes
version	Yes	Set to 0
roles	Yes	Each customer must have at least one role. The role must be set as an empty object.
company	*	If the contact is of type company it must be set.
person	*	If the contact is of type person it must be set.
Company is required if the contact is of type Company. If company details are provided, the person details have to be absent. Person is required if the contact is of type Person. If person details are provided, the company details have to be absent. Each contact must at least have a company or person detail object.
Company Details

                    Property	Required	Notes
name	Yes	Must not be empty if customer is of type company.
Company Contact Person Details

                    Property	Required	Notes
salutation	No	Changed to optional (see Change Log).
lastName	Yes	Must be not empty if customer is of type company.
Person Details

                    Property	Required	Notes
salutation	No	Changed to optional (see Change Log).
lastName	Yes	Must be not empty if customer is of type person.
Address Details

                    Property	Required	Notes
countryCode	Yes	Must be not empty. Must contain the country code in the format of ISO 3166 alpha2 (e.g. DE is used for germany).
Retrieve a Contact
Sample request

curl https://api.lexware.io/v1/contacts/e9066f04-8cc7-4616-93f8-ac9ecc8479c8
-X GET
-H "Authorization: Bearer {accessToken}"
-H "Accept: application/json"
Sample response

{
  "id": "e9066f04-8cc7-4616-93f8-ac9ecc8479c8",
  "organizationId": "aa93e8a8-2aa3-470b-b914-caad8a255dd8",
  "version": 0,
  "roles": {
    "customer": {
      "number": 10308
    }
  },
  "person": {
    "salutation": "Frau",
    "firstName": "Inge",
    "lastName": "Musterfrau"
  },
  "note": "Notizen",
  "archived": false
}
GET {resourceurl}/v1/contacts/{id}

Returns the contact with id value {id}.

Update a Contact
PUT {resourceurl}/v1/contacts/{id}

Update an existing contact with id {id} with the data given in the payload as JSON. Returns an action result on success.

For information about required fields please see Create a contact.

A contact cannot be updated via the API in case an item of the following list has more than one entry. Any attempt will result in a validation error.
addresses.billing
addresses.shipping
emailAddresses.business
emailAddresses.office
emailAddresses.private
emailAddresses.other
phoneNumbers.business
phoneNumbers.office
phoneNumbers.mobile
phoneNumbers.private
phoneNumbers.fax
phoneNumbers.other
company.contactPersons
Filtering Contacts
GET {resourceurl}/v1/contacts?filter_1=value_1&...&filter_n=value_n

Sample request for retrieving all contacts

curl https://api.lexware.io/v1/contacts?page=0
-X GET
-H "Authorization: Bearer {accessToken}"
-H "Accept: application/json"
Sample response

{
  "content": [
  {
    "id": "e9066f04-8cc7-4616-93f8-ac9ecc8479c8",
    "organizationId": "aa93e8a8-2aa3-470b-b914-caad8a255dd8",
    "version": 0,
    "roles": {
      "customer": {
        "number": 10308
      }
    },
    "person": {
      "salutation": "Frau",
      "firstName": "Inge",
      "lastName": "Musterfrau"
    },
    "archived": false
  },
  {
    "id": "313ef116-a432-4823-9dfe-1b1200eb458a",
    "organizationId": "aa93e8a8-2aa3-470b-b914-caad8a255dd8",
    "version": 0,
    "roles": {
      "customer": {
        "number": 10309
      }
    },
    "person": {
      "salutation": "Herr",
      "firstName": "Max",
      "lastName": "Mustermann"
    },
    "archived": true
  }
],
"totalPages": 1,
"totalElements": 2,
"last": true,
"sort": [
  {
    "direction": "ASC",
    "property": "name",
    "ignoreCase": false,
    "nullHandling": "NATIVE",
    "ascending": true
  }
],
"size": 25,
"number": 0,
"first": true,
"numberOfElements": 2
}
Sample request for a filter with email max@gmx.de and name Mustermann:

curl https://api.lexware.io/v1/contacts?email=max@gmx.de&name=Mustermann
-X GET
-H "Authorization: Bearer {accessToken}"
-H "Accept: application/json"
Sample call Filter only vendor contacts:

curl https://api.lexware.io/v1/contacts?vendor=true&customer=false
-X GET
-H "Authorization: Bearer {accessToken}"
-H "Accept: application/json"
Returns the contacts that fulfill the criteria given by filters filter_1 to filter_n using a paging mechanism. If more than one filter is given, the logical connector is AND. Filters that are not set are ignored. To check the maximum page size for this endpoint, see Paging of Resources.

Note that a filter should not be present more than once in a request.

The following table describes the possible filter parameters.

Parameter	Description
email
string	filters contacts where any of their email addresses inside the emailAddresses object or in company contactPersons match the given email value. At least 3 characters are necessary to successfully complete the query.
name
string	filters contacts whose name matches the given name value. At least 3 characters are necessary to successfully complete the query.
number
integer	returns the contacts with the specified contact number. Number is either the customer number or the vendor number located in the roles object.
customer
boolean	if set to true filters contacts that have the role customer. If set to false filters contacts that do not have the customer role.
vendor
boolean	if set to true filters contacts that have the role vendor. If set to false filters contacts that do not have the vendor role.
The email and name filters provide case-insensitive pattern matching semantics. This means: (a) the filter string will be searched as a substring of the contact's property (email=doe@example will find john.doe@example.com), and (b) you can use the pattern matching special characters _ (meaning: a single, arbitrary character) and % (meaning: an arbitrary number of arbitrary characters). To search for these actual characters, use a backslash to escape them.
Examples of pattern matching:

email=a_b@example.com will find a.b@example.com, a_b@example.com, and azb@example.com
email=a\_b@example.com will only find a_b@example.com
email=a%b@example will find a.b@example.com, a_b@example.com, azb@example.com, and anna.and.jacob@example.com
email=n_d_e@example.com will find both john.doe@example.com and n_d_e@example.com ⚠️
The values of all mentioned properties have to be URL encoded when used to send data to Lexware. See this FAQ for more information.
Deeplink to Contacts
Newly created contacts can be accessed via the following deeplink for further processing by the user — for example, to adjust or complete contact details not available through the API.

View URL {appbaseurl}/permalink/contacts/view/{contactId}

Countries Endpoint
Purpose
The countries endpoint provides read access to the list of countries known to Lexware.

Country properties
                    Property	Description
countryCode
string	The country's code. See our FAQ for specification.
countryNameEN
string	Country name (English)
countryNameDE
string	Country name (German translation)
taxClassification
enum	Tax classification. Possible values are de (Germany), intraCommunity (eligible for Innergemeinschaftliche Lieferung), and thirdPartyCountry (other). See below
Country tax classification
The tax classification as supplied by the countries endpoint refers to the current classification of the country. As countries enter or leave the EU, their classification may be subject to change. At this time, the countries endpoint will always return the current state.

When a country bearing the intraCommunity classification is referred to in vouchers, their tax type may be eligible to be set to intraCommunitySupply. However, that decision may be based on other properties of the organization and the referenced contact information.

Retrieve List of Countries
Sample request

curl https://api.lexware.io/v1/countries
-X GET
-H "Authorization: Bearer {accessToken}"
-H "Accept: application/json"
Sample Response

[
    {
        "countryCode": "DE",
        "countryNameDE": "Deutschland",
        "countryNameEN": "Germany",
        "taxClassification": "de"
    },
    {
        "countryCode": "FR",
        "countryNameDE": "Frankreich",
        "countryNameEN": "France",
        "taxClassification": "intraCommunity"
    },
    {
        "countryCode": "US",
        "countryNameDE": "Vereinigte Staaten von Amerika",
        "countryNameEN": "United States",
        "taxClassification": "thirdPartyCountry"
    }
]
GET {resourceurl}/v1/countries

The following sample shows how to retrieve list of currently known countries. It is required to replace the placeholder {accessToken} before sending the request.

Credit Notes Endpoint
Purpose
This endpoint provides read and write access to credit notes and also the possibility to render the document as a PDF in order to download it. Credit notes can be created as a draft or finalized in open mode.

With a credit note the partial or full amount of an invoice can be refunded to a customer.

A credit note may be related to an invoice but can also be standalone without any reference to an invoice. If related to an invoice, the credit note's status will immediately switch to paidoff on finalization and the open payment amount of the related invoice is either reduced or completely paid. There can only be one credit note related to an invoice. An unrelated and finalized credit note will remain in status open until the Lexware user assigns the payment in Lexware. Please note, that the printed document does not show the related invoice resp. the invoice number. However, to show the invoice number, it can simply be included in the header text (introduction).

It is possible to create credit notes with value-added tax such as of type net (Netto), gross (Brutto) or different types of vat-free. For tax-exempt organizations vat-free (Steuerfrei) credit notes can be created exclusively. All other vat-free tax types are only usable in combination with a referenced contact in Lexware. For recipients within the EU these are intra-community supply (Innergemeinschaftliche Lieferung gem. §13b UStG), constructional services (Bauleistungen gem. §13b UStG) and external services (Fremdleistungen innerhalb der EU gem. §13b UStG). For credit notes to third countries, the tax types third party country service (Dienstleistungen an Drittländer) and third party country delivery (Ausfuhrlieferungen an Drittländer) are possible.

Credit Notes Properties
Sample of a credit note with multiple line items. Fields with no content are displayed with "null" just for demonstration purposes.

{
   "id":"e9066f04-8cc7-4616-93f8-ac9ecc8479c8",
   "organizationId":"aa93e8a8-2aa3-470b-b914-caad8a255dd8",
   "createdDate":"2023-06-17T18:32:07.480+02:00",
   "updatedDate":"2023-06-17T18:32:07.551+02:00",
   "version":1,
   "language":"de",
   "archived":false,
   "voucherStatus":"draft",
   "voucherNumber":"GS0007",
   "voucherDate":"2023-02-22T00:00:00.000+01:00",
   "address":{
      "name":"Bike & Ride GmbH & Co. KG",
      "supplement":"Gebäude 10",
      "street":"Musterstraße 42",
      "city":"Freiburg",
      "zip":"79112",
      "countryCode":"DE"
   },
   "electronicDocumentProfile":"NONE",
   "lineItems":[
      {
         "type":"custom",
         "name":"Abus Kabelschloss Primo 590 ",
         "description":"· 9,5 mm starkes, smoke-mattes Spiralkabel mit integrierter Halterlösung zur Befestigung am Sattelklemmbolzen · bewährter Qualitäts-Schließzylinder mit praktischem Wendeschlüssel · KabelØ: 9,5 mm, Länge: 150 cm",
         "quantity":2,
         "unitName":"Stück",
         "unitPrice":{
            "currency":"EUR",
            "netAmount":13.4,
            "grossAmount":15.946,
            "taxRatePercentage":19
         },
         "lineItemAmount":26.8
      },
      {
         "type":"custom",
         "name":"Energieriegel Testpaket",
         "quantity":1,
         "unitName":"Stück",
         "unitPrice":{
            "currency":"EUR",
            "netAmount":5,
            "grossAmount":5,
            "taxRatePercentage":0
         },
         "lineItemAmount":5
      }
   ],
   "totalPrice":{
      "currency":"EUR",
      "totalNetAmount":31.8,
      "totalGrossAmount":36.89,
      "totalTaxAmount":5.09
   },
   "taxAmounts":[
      {
         "taxRatePercentage":0,
         "taxAmount":0,
         "netAmount":5
      },
      {
         "taxRatePercentage":19,
         "taxAmount":5.09,
         "netAmount":26.8
      }
   ],
   "taxConditions":{
      "taxType":"net"
   },
   "relatedVouchers":[],
   "printLayoutId": "28c212c4-b6dd-11ee-b80a-dbc65f4ceccf",
   "title":"Rechnungskorrektur",
   "introduction":"Rechnungskorrektur zur Rechnung RE-00020",
   "remark":"Folgende Lieferungen/Leistungen schreiben wir Ihnen gut.",
   "files":{
      "documentFileId":"a79fea19-a892-4ea9-89ad-e879946329a3"
   }
}
                    Property	Description
id
uuid	Unique id generated on creation by Lexware.
Read-only.
organizationId
uuid	Unique id of the organization the credit note belongs to.
Read-only.
createdDate
dateTime	The instant of time when the credit note was created by Lexware in format yyyy-MM-ddTHH:mm:ss.SSSXXX as described in RFC 3339/ISO 8601 (e.g. 2023-02-21T00:00:00.000+01:00).
Read-only.
updatedDate
dateTime	The instant of time when the credit note was updated by Lexware in format yyyy-MM-ddTHH:mm:ss.SSSXXX as described in RFC 3339/ISO 8601 (e.g. 2023-02-21T00:00:00.000+01:00).
Read-only.
version
integer	Version (revision) number which will be increased on each change to handle optimistic locking.
Read-only.
language
string	Specifies the language of the credit note which affects the print document but also set translated default text modules when no values are send (e.g. for introduction). Values accepted in ISO 639-1 code. Possible values are German de (default) and English en.
archived
boolean	Specifies if the credit note is only available in the archive in Lexware.
Read-only.
voucherStatus
enum	Specifies the status of the credit note. Possible values are draft (is editable), open (finalized and no longer editable but not yet paid off), paidoff (has been fully paid back to the customer), voided (cancelled)
Read-only.
voucherNumber
string	The specific number a credit note is aware of. This consecutive number is set by Lexware on creation.
Read-only.
voucherDate
dateTime	The date of credit note in format yyyy-MM-ddTHH:mm:ss.SSSXXX as described in RFC 3339/ISO 8601 (e.g. 2023-02-21T00:00:00.000+01:00).
address
object	The address of the credit note recipient. For details see below.
electronicDocumentProfile
enum	The electronic document profile of the credit note. Possible values are NONE (no electronic document profile, also returned for non-invoice sales vouchers and draft invoices), EN16931 (ZUGFeRD), and XRechnung (XRechnung enabled invoice).
Read-only.
lineItems
list	The items of the credit note. For details see below.
totalPrice
object	The total price of the credit note. For details see below.
taxAmounts
list	The tax amounts for each tax rate. Please note: As done with every read-only element or object all submitted content (POST) will be ignored. For details see below.
Read-only.
taxConditions
object	The tax conditions of the credit note. For details see below.
relatedVouchers
list	The related vouchers of the credit note. Read-only.
printLayoutId
uuid	(Optional) The id of the print layout to be used for the credit note. The organization's default print layout will be used if no value is sent.
title
string	(Optional) A title text. The organization's default is used if no value was sent.
introduction
string	(Optional) An introductory text / header. The organization's default is used if no value was sent. We recommended to include the invoice number in the header when the credit note is related to an invoice.
remark
string	(Optional) A closing text note. The organization's default is used if no value was sent.
files
object	(Deprecated, will be removed) The document id for the PDF version of the credit note. For details see below.
Read-only.
Compared to invoices, credit notes do not have a due date, shipping conditions, delivery terms, payment conditions and any line item discounts.
Address Details

There are two main options to address the recipient of a credit note. First, using an existing Lexware contact or second, creating a new address.

For referencing an existing contact it is only necessary to provide the UUID of that contact. Usually the billing address is used (for delivery notes, the shipping address will be preferred). Additionally, the referenced address can also be modified for this specific credit note. This can be done by setting all required address fields and this deviated address will not be stored back to the Lexware contacts.

The referenced contact needs to have the role customer. For more information please refer to the contacts endpoint.
Otherwise, a new address for the credit note recipient can be created. That type of address is called a "one-time address". A one-time address will not create a new contact in Lexware. For instance, this could be useful when it is not needed to create a contact in Lexware for each new credit note.

Please get in touch with us if you are not sure which option fits your use case best.

                    Property	Description
contactId
uuid	If the credit note recipient is (optionally) registered as a contact in Lexware, this field specifies the related id of the contact.
name
string	The name of the credit note recipient. To use an existing contact of an individual person, provide the name in the format {firstname} {lastname}.
supplement
string	(Optional) An address supplement.
street
string	The street (street and street number) of the address.
city
string	The city of the address.
zip
string	The zip code of the address.
countryCode
enum	The ISO 3166 alpha2 country code of the address.
contactPerson
string	The contact person selected while editing the voucher. The primary contact person will be used when creating vouchers via the API with a referenced contactId.
Read-only.
Line Items Details

A maximum of 300 line items can be used in a single credit note.
For referencing an existing product or service, it is necessary to provide its UUID. However, all required properties must still be specified for the referencing line item. Additionally, the referenced product or service can be modified by adjusting the input. This deviated data will not be stored back to the product/service in Lexware.

                    Property	Description
id
uuid	The field specifies the related id of a referenced product/service.
type
enum	The type of the item. Possible values are service (the line item is related to a supply of services), material (the line item is related to a physical product), custom (an item without reference in Lexware and has no id) or text (contains only a name and/or a description for informative purposes).
name
string	The name of the item.
description
string	The description of the item.
quantity
number	The amount of the purchased item. The value can contain up to 4 decimals.
unitName
string	The unit name of the purchased item. If the provided unit name is not known in Lexware it will be created on the fly.
unitPrice
object	The unit price of the purchased item. For details see below.
lineItemAmount
number	The total price of this line item. Depending by the selected taxType in taxConditions, the amount must be given either as net or gross. The value can contain up to 2 decimals.
Read-only.
Unit Price Details

                    Property	Description
currency
enum	The currency of the price. Currently only EUR is supported.
netAmount
number	The net price of the unit price. The value can contain up to 4 decimals.
grossAmount
number	The gross price of the unit price. The value can contain up to 4 decimals.
taxRatePercentage
number	The tax rate of the unit price. See the "Supported tax rates" FAQ for more information and a list of possible values.. For vat-free sales vouchers the tax rate percentage must be 0.
Total Price Details

                    Property	Description
currency
string	The currency of the total price. Currently only EUR is supported.
totalNetAmount
number	The total net price over all line items. The value can contain up to 2 decimals.
Read-only.
totalGrossAmount
number	The total gross price over all line items. The value can contain up to 2 decimals.
Read-only.
totalTaxAmount
number	The total tax amount over all line items. The value can contain up to 2 decimals.
Read-only.
totalDiscountAbsolute
number	(Optional) A total discount as absolute value. The value can contain up to 2 decimals.
totalDiscountPercentage
number	(Optional) A total discount relative to the gross amount or net amount dependent on the given tax conditions. A contact-specific default will be set if available and no total discount was send. The value can contain up to 2 decimals.
Tax Amounts Details

                    Property	Description
taxRatePercentage
number	Tax rate as percentage value. See the "Supported tax rates" FAQ for more information and a list of possible values..
taxAmount
number	The total tax amount for this tax rate. The value can contain up to 2 decimals.
netAmount
number	The total net amount for this tax rate. The value can contain up to 2 decimals.
Tax Conditions Details

Sample for vat-free tax conditions

"taxConditions": {
    "taxType": "constructionService13b",
    "taxTypeNote": "Steuerschuldnerschaft des Leistungsempfängers (Reverse Charge)"
}
                    Property	Description
taxType
enum	The tax type for the credit note. Possible values are net, gross, vatfree (Steuerfrei), intraCommunitySupply (Innergemeinschaftliche Lieferung gem. §13b UStG), constructionService13b (Bauleistungen gem. §13b UStG), externalService13b (Fremdleistungen innerhalb der EU gem. §13b UStG), thirdPartyCountryService (Dienstleistungen an Drittländer), thirdPartyCountryDelivery (Ausfuhrlieferungen an Drittländer), and photovoltaicEquipment (0% taxation for photovoltaic equipment and installations in Germany starting 2023-01, Material und Leistungen für Photovoltaik-Installationen)
taxSubType
enum	A tax subtype. Only required for dedicated cases. For vouchers referencing a B2C customer in the EU, and with a taxType of net or gross, the taxSubType may be set to distanceSales, or electronicServices. Passing a null value results in a standard voucher.
If the organization's distanceSalesPrinciple (profile endpoint) is set to DESTINATION and this attribute is set to distanceSales or electronicServices, the voucher needs to reference the destination country's tax rates.
taxTypeNote
string	When taxType is set to a vat-free tax type then a note regarding the conditions can be set. When omitted Lexware sets the organization's default.
Related Vouchers Details

The relatedVouchers property documents all existing voucher relations for the current sales voucher. If no related vouchers exist, an empty list will be returned.

                    Property	Description
id
uuid	The related sales voucher's unique id.
voucherNumber
string	The specific number of the related sales voucher.
Read-only.
voucherType
string	Voucher type of the related sales voucher.
All attributes listed above are read-only.

Files Details

The files object with its property documentFileId is deprecated and will be removed.
                    Property	Description
documentFileId
uuid	The id of the credit note PDF. The PDF will be created when the credit note turns from draft into status open or paidoff. To download the credit note PDF file please use the files endpoint.
Create a Credit Note
Sample request to create a credit note

curl https://api.lexware.io/v1/credit-notes
-X POST
-H "Authorization: Bearer {accessToken}"
-H "Content-Type: application/json"
-H "Accept: application/json"
-d '
{
  "archived": false,
  "voucherDate": "2023-02-22T00:00:00.000+01:00",
  "address": {
    "name": "Bike & Ride GmbH & Co. KG",
    "supplement": "Gebäude 10",
    "street": "Musterstraße 42",
    "city": "Freiburg",
    "zip": "79112",
    "countryCode": "DE"
  },
  "lineItems": [
    {
      "type": "custom",
      "name": "Abus Kabelschloss Primo 590 ",
      "description": "· 9,5 mm starkes, smoke-mattes Spiralkabel mit integrierter Halterlösung zur Befestigung am Sattelklemmbolzen · bewährter Qualitäts-Schließzylinder mit praktischem Wendeschlüssel · KabelØ: 9,5 mm, Länge: 150 cm",
      "quantity": 2,
      "unitName": "Stück",
      "unitPrice": {
        "currency": "EUR",
        "netAmount": 13.4,
        "taxRatePercentage": 19
      }
    },
    {
      "type": "custom",
      "name": "Energieriegel Testpaket",
      "quantity": 1,
      "unitName": "Stück",
      "unitPrice": {
        "currency": "EUR",
        "netAmount": 5,
        "taxRatePercentage": 0
      }
    },
    {
      "type": "text",
      "name": "Strukturieren Sie Ihre Belege durch Text-Elemente.",
      "description": "Das hilft beim Verständnis"
    }
  ],
  "totalPrice": {
    "currency": "EUR"
   },
  "taxConditions": {
    "taxType": "net"
  },
  "title": "Rechnungskorrektur",
  "introduction": "Rechnungskorrektur zur Rechnung RE-00020",
  "remark": "Folgende Lieferungen/Leistungen schreiben wir Ihnen gut."
}
'
Sample response

{
  "id": "e9066f04-8cc7-4616-93f8-ac9ecc8479c8",
  "resourceUri": "https://api.lexware.io/v1/credit-notes/e9066f04-8cc7-4616-93f8-ac9ecc8479c8",
  "createdDate": "2023-06-17T18:32:07.480+02:00",
  "updatedDate": "2023-06-17T18:32:07.551+02:00",
  "version": 1
}
POST {resourceurl}/v1/credit-notes[?finalize=true]

Credit notes transmitted via the API are created in draft mode per default. To create a finalized credit note with status open the optional query parameter finalize has to be set. The status of a credit note cannot be changed via the api.

The created credit note will be shown in the main voucher list in Lexware: https://app.lexware.de/vouchers. To provide your customers access to the created credit note please use our deeplink function.

The contents of the credit note are expected in the request's body as an application/json and must not contain read-only fields. See our FAQ on further information on text fields.

Description of required properties when creating a credit note.

                    Property	Required	Notes
voucherDate	Yes	
address	Yes	Nested object. Required fields for address please see below.
lineItems	Yes	List of nested objects. Required fields for lineItems please see below.
totalPrice	Yes	Nested object. Required fields for totalPrice please see below.
taxConditions	Yes	Nested object. Required fields for taxConditions see below.
Address Required Properties

Description of required address properties when creating a credit note.

                    Property	Required	Notes
contactId	*	Only when referencing an existing Lexware contact.
name	*	Only required when no existing contact is referenced.
countryCode	*	Only required when no existing contact is referenced.
Line Items Required Properties

Description of required lineItem properties when creating a credit note.

                    Property	Required	Notes
id	*	Required for type service and material.
type	Yes	Supported values are custom, material, service and text.
name	Yes	
quantity	*	Required for type custom, service and material.
unitName	*	Required for type custom, service and material.
unitPrice	*	Required for type custom, service and material. Nested object. Required fields for unitPrice see below.
Unit Price Required Properties

Description of required unitPrice properties when creating a credit note.

                    Property	Required	Notes
currency	Yes	
netAmount	*	Only relevant if taxConditions.taxType != gross is delivered.
grossAmount	*	Only relevant if taxConditions.taxType == gross is delivered.
taxRatePercentage	Yes	Must be 0 for vat-free sales voucher.
Total Price Required Properties

Description of required totalPrice properties when creating a credit note.

                    Property	Required	Notes
currency	Yes	
Tax Condition Required Properties

Description of required tax condition properties when creating a credit note.

                    Property	Required	Notes
taxType	Yes	Supported values are: gross, net, vatfree, intraCommunitySupply, constructionService13b, externalService13b, thirdPartyCountryService, thirdPartyCountryDelivery.
Pursue to a Credit Note
POST {resourceurl}/v1/credit-notes?precedingSalesVoucherId={id}[&finalize=true]

To be able to pursue a sales voucher to a credit note, the optional query parameter precedingSalesVoucherId needs to be set. The id value {id} refers to the preceding sales voucher which is going to be pursued.

To get an overview of the valid and possible pursue actions in Lexware, please see the linked sales voucher document chain. The recommended process is highlighted in blue. If the pursue action is not valid, the request will be rejected with 406 response.

When referenced to an invoice, a finalized credit note is immediately paidoff and the open amount of the invoice is reduced by the amount of the credit note.

 Please note that a closing invoice cannot be pursued to a credit note.
If an invoice with the status draft is referenced by the precedingSalesVoucherId, the request will be rejected with 406 response.
Retrieve a Credit Note
Sample request

curl https://api.lexware.io/v1/credit-notes/e9066f04-8cc7-4616-93f8-ac9ecc8479c8
-X GET
-H "Authorization: Bearer {accessToken}"
-H "Accept: application/json"
Sample response


{
    "id": "e9066f04-8cc7-4616-93f8-ac9ecc8479c8",
    "organizationId": "aa93e8a8-2aa3-470b-b914-caad8a255dd8",
    "createdDate": "2023-06-17T18:32:07.480+02:00",
    "updatedDate": "2023-06-17T18:32:07.551+02:00",
    "version": 1,
    "language": "de",
    "archived": false,
    "voucherStatus": "draft",
    "voucherNumber": "GS0007",
    "voucherDate": "2023-02-22T00:00:00.000+01:00",
    "address": {
        "name": "Bike & Ride GmbH & Co. KG",
        "supplement": "Gebäude 10",
        "street": "Musterstraße 42",
        "city": "Freiburg",
        "zip": "79112",
        "countryCode": "DE"
    },
    "lineItems": [
        {
            "type": "custom",
            "name": "Abus Kabelschloss Primo 590 ",
            "description": "· 9,5 mm starkes, smoke-mattes Spiralkabel mit integrierter Halterlösung zur Befestigung am Sattelklemmbolzen · bewährter Qualitäts-Schließzylinder mit praktischem Wendeschlüssel · KabelØ: 9,5 mm, Länge: 150 cm",
            "quantity": 2,
            "unitName": "Stück",
            "unitPrice": {
                "currency": "EUR",
                "netAmount": 13.4,
                "grossAmount": 15.946,
                "taxRatePercentage": 19
            },
            "lineItemAmount": 26.8
        },
        {
            "type": "custom",
            "name": "Energieriegel Testpaket",
            "quantity": 1,
            "unitName": "Stück",
            "unitPrice": {
                "currency": "EUR",
                "netAmount": 5,
                "grossAmount": 5,
                "taxRatePercentage": 0
            },
            "lineItemAmount": 5
        }
    ],
    "totalPrice": {
        "currency": "EUR",
        "totalNetAmount": 31.8,
        "totalGrossAmount": 36.89,
        "totalTaxAmount": 5.09
    },
    "taxAmounts": [
        {
            "taxRatePercentage": 0,
            "taxAmount": 0,
            "netAmount": 5
        },
        {
            "taxRatePercentage": 19,
            "taxAmount": 5.09,
            "netAmount": 26.8
        }
    ],
    "taxConditions": {
        "taxType": "net"
    },
    "title": "Rechnungskorrektur",
    "introduction": "Rechnungskorrektur zur Rechnung RE-00020",
    "remark": "Folgende Lieferungen/Leistungen schreiben wir Ihnen gut."
}
GET {resourceurl}/v1/credit-notes/{id}

Returns the credit note with id value {id}.

Render a Credit Note Document (PDF)
This endpoint is deprecated and should no longer be used. Instead, use the credit note file subresource to directly download the document by specifying the id of the credit note.
Sample request

curl https://api.lexware.io/v1/credit-notes/e9066f04-8cc7-4616-93f8-ac9ecc8479c8/document
-X GET
-H "Authorization: Bearer {accessToken}"
-H "Accept: application/json"
Sample response

{
  "documentFileId": "b26e1d73-19ff-46b1-8929-09d8d73d4167"
}
GET {resourceurl}/v1/credit-notes/{id}/document

To download the PDF file of a credit note document, you need its documentFileId. This id is usually returned by the credit note resource. However, PDF document file rendering must be triggered separately via this endpoint for credit notes created through the API with the status open.

The returned documentFileId can be used to download the credit note PDF document via the (Files Endpoint).

For credit notes in draft mode, there does not exist a document file in Lexware. Any request attempts are rejected with 406 responses.
Download a Credit Note File
GET {resourceurl}/v1/credit-notes/{id}/file

Sample request to download a credit note file

curl "https://api.lexware.io/v1/credit-notes/{id}/file"
-X GET
-H "Accept: */*"
-H "Authorization: Bearer {accessToken}"
Returns the file as binary data with HTTP response code 200. The HTTP header fields Content-Type specifies the file type (MIME type) and the Content-Length the size of the file in bytes. A suggested file name is returned in the header Content-Disposition.

For a credit note, there can be multiple files associated with a single voucher document. Foremost, this includes e-invoices which provide a pdf and an xml representation. Use the Accept header as decribed below to choose between the downloaded formats.
For a credit note both regular invoices as well as e-invoices are supported.

Regular invoices are only available in PDF format. E-invoices that include embedded XML data (e.g. ZUGFeRD invoices) can also only be downloaded as PDF files. E-invoices of the type XRechnung can be downloaded either in XML or in PDF format. Lexware generates the PDF of an XRechnung solely as a preview. It is not a valid e-invoice and should not be used as one. By sending different Accept headers, the client can choose which representation they want to retrieve.

Accept headers with wildcards are also supported and will return the default representation.

Here's a list of which file type (or which HTTP error) is returned for each voucher type and Accept header combination:

document profile	*/*	application/xml	application/pdf
XRechnung	.xml	.xml	.pdf
ZUGFeRD	.pdf	404	.pdf
regular PDF	.pdf	404	.pdf
If the credit note itself does not exist, the request will be rejected with 404 Not Found.

Requests for other media types than application/pdf, application/xml and */* will generally be rejected with an HTTP status of 406 Not Acceptable.

For credit notes in draft mode, there does not exist a document file in Lexware. Any request attempts are rejected with 409 responses.
Deeplink to a Credit Note
Credit notes can be directly accessed by permanent HTTPS links to either be viewed or to be edited. If a credit note is not allowed to be edited, a redirection to the view page takes place. In case the given id does not exist, a redirection to the main voucher list takes place.

View URL {appbaseurl}/permalink/credit-notes/view/{id}

Edit URL {appbaseurl}/permalink/credit-notes/edit/{id}

Delivery Notes Endpoint
Purpose
This endpoint provides read and write access to delivery notes and also the possibility to render the document as a PDF in order to download it. Delivery notes can be created as a draft or finalized in open mode.

When creating delivery notes to existing invoices, it is recommended to use the pursue action to create a reference between the documents. Please note, that the printed document does not show the related invoice resp. the invoice number. However, to show the invoice number, it can simply be included in the header text (introduction).

Delivery notes contain neither payment conditions nor prices, reductions and tax amounts.

Delivery Notes Properties
Sample of a delivery note with multiple line items. Fields with no content are displayed with "null" just for demonstration purposes.

{
   "id":"e9066f04-8cc7-4616-93f8-ac9ecc8479c8",
   "organizationId":"aa93e8a8-2aa3-470b-b914-caad8a255dd8",
   "createdDate":"2023-06-17T18:32:07.480+02:00",
   "updatedDate":"2023-06-17T18:32:07.551+02:00",
   "version":1,
   "language":"de",
   "archived":false,
   "voucherStatus":"draft",
   "voucherNumber":"LS0007",
   "voucherDate":"2023-02-22T00:00:00.000+01:00",
   "address":{
      "name":"Bike & Ride GmbH & Co. KG",
      "supplement":"Gebäude 10",
      "street":"Musterstraße 42",
      "city":"Freiburg",
      "zip":"79112",
      "countryCode":"DE"
   },
   "electronicDocumentProfile":"NONE",
   "lineItems":[
      {
         "type":"custom",
         "name":"Abus Kabelschloss Primo 590 ",
         "description":"· 9,5 mm starkes, smoke-mattes Spiralkabel mit integrierter Halterlösung zur Befestigung am Sattelklemmbolzen · bewährter Qualitäts-Schließzylinder mit praktischem Wendeschlüssel · KabelØ: 9,5 mm, Länge: 150 cm",
         "quantity":2,
         "unitName":"Stück",
         "unitPrice":{
            "currency":"EUR",
            "netAmount":13.4,
            "grossAmount":15.946,
            "taxRatePercentage":19
         }
      },
      {
         "type":"custom",
         "name":"Energieriegel Testpaket",
         "quantity":1,
         "unitName":"Stück",
         "unitPrice":{
            "currency":"EUR",
            "netAmount":5,
            "grossAmount":5,
            "taxRatePercentage":0
         }
      }
   ],
   "taxConditions":{
      "taxType":"net"
   },
   "relatedVouchers":[],
   "printLayoutId": "28c212c4-b6dd-11ee-b80a-dbc65f4ceccf",
   "title":"Lieferschein",
   "introduction":"Lieferschein zur Rechnung RE-00020",
   "remark":"Folgende Lieferungen/Leistungen schreiben wir Ihnen gut.",
   "files":{
      "documentFileId":"a79fea19-a892-4ea9-89ad-e879946329a3"
   }
}
                    Property	Description
id
uuid	Unique id generated on creation by Lexware.
Read-only.
organizationId
uuid	Unique id of the organization the delivery note belongs to.
Read-only.
createdDate
dateTime	The instant of time when the delivery note was created by Lexware in format yyyy-MM-ddTHH:mm:ss.SSSXXX as described in RFC 3339/ISO 8601 (e.g. 2023-02-21T00:00:00.000+01:00).
Read-only.
updatedDate
dateTime	The instant of time when the delivery note was updated by Lexware in format yyyy-MM-ddTHH:mm:ss.SSSXXX as described in RFC 3339/ISO 8601 (e.g. 2023-02-21T00:00:00.000+01:00).
Read-only.
version
integer	Version (revision) number which will be increased on each change to handle optimistic locking.
Read-only.
language
string	Specifies the language of the delivery note which affects the print document but also set translated default text modules when no values are send (e.g. for introduction). Values accepted in ISO 639-1 code. Possible values are German de (default) and English en.
archived
boolean	Specifies if the delivery note is only available in the archive in Lexware.
Read-only.
voucherStatus
enum	Specifies the status of the delivery note. Possible values are draft (is editable) and open (finalized and no longer editable).
Read-only.
voucherNumber
string	The specific number a delivery note is aware of. This consecutive number is set by Lexware on creation.
Read-only.
voucherDate
dateTime	The date of delivery note in format yyyy-MM-ddTHH:mm:ss.SSSXXX as described in RFC 3339/ISO 8601 (e.g. 2023-02-21T00:00:00.000+01:00).
address
object	The address of the delivery note recipient. For details see below.
electronicDocumentProfile
enum	The electronic document profile of the delivery note. Always contains the value NONE.
Read-only.
lineItems
list	The items of the delivery note. For details see below.
taxConditions
object	The tax conditions of the delivery note. For details see below.
relatedVouchers
list	The related vouchers of the delivery note. Read-only.
printLayoutId
uuid	(Optional) The id of the print layout to be used for the delivery note. The organization's default print layout will be used if no value is sent.
title
string	(Optional) A title text. The organization's default is used if no value was sent.
introduction
string	(Optional) An introductory text / header. The organization's default is used if no value was sent. We recommend to include the invoice number in the header when the delivery note is related to an invoice.
remark
string	(Optional) A closing text note. The organization's default is used if no value was sent.
deliveryTerms
string	(Optional) Describes the terms for delivery. The organization's (or contact-specific) default is used if no value was sent.
files
object	(Deprecated, will be removed) The document id for the PDF version of the delivery note. For details see below.
Read-only.
Compared to invoices, delivery notes do not have a due date, payment conditions, total price, tax amounts, and any line item amounts and discounts. The unit prices of line items are optional.
Address Details

There are two main options to address the recipient of a delivery note. First, using an existing Lexware contact or second, creating a new address.

For referencing an existing contact it is only necessary to provide the UUID of that contact. Usually the billing address is used (for delivery notes, the shipping address will be preferred). Additionally, the referenced address can also be modified for this specific delivery note. This can be done by setting all required address fields and this deviated address will not be stored back to the Lexware contacts.

The referenced contact needs to have the role customer. For more information please refer to the contacts endpoint.
Otherwise, a new address for the delivery note recipient can be created. That type of address is called a "one-time address". A one-time address will not create a new contact in Lexware. For instance, this could be useful when it is not needed to create a contact in Lexware for each new delivery note.

Please get in touch with us if you are not sure which option fits your use case best.

                    Property	Description
contactId
uuid	If the delivery note recipient is (optionally) registered as a contact in Lexware, this field specifies the related id of the contact.
name
string	The name of the delivery note recipient. To use an existing contact of an individual person, provide the name in the format {firstname} {lastname}.
supplement
string	(Optional) An address supplement.
street
string	The street (street and street number) of the address.
city
string	The city of the address.
zip
string	The zip code of the address.
countryCode
enum	The ISO 3166 alpha2 country code of the address.
contactPerson
string	The contact person selected while editing the voucher. The primary contact person will be used when creating vouchers via the API with a referenced contactId.
Read-only.
Line Items Details

A maximum of 300 line items can be used in a single delivery note.
For referencing an existing product or service, it is necessary to provide its UUID. However, all required properties must still be specified for the referencing line item. Additionally, the referenced product or service can be modified by adjusting the input. This deviated data will not be stored back to the product/service in Lexware.

                    Property	Description
id
uuid	The field specifies the related id of a referenced product/service.
type
enum	The type of the item. Possible values are service (the line item is related to a supply of services), material (the line item is related to a physical product), custom (an item without reference in Lexware and has no id) or text (contains only a name and/or a description for informative purposes).
name
string	The name of the item.
description
string	The description of the item.
quantity
number	The amount of the purchased item. The value can contain up to 4 decimals.
unitName
string	The unit name of the purchased item. If the provided unit name is not known in Lexware it will be created on the fly.
unitPrice
object	The unit price of the purchased item. For details see below.
lineItemAmount
number	The total price of this line item. Depending by the selected taxType in taxConditions, the amount must be given either as net or gross. The value can contain up to 2 decimals.
Read-only.
Unit Price Details

                    Property	Description
currency
enum	The currency of the price. Currently only EUR is supported.
netAmount
number	The net price of the unit price. The value can contain up to 4 decimals.
grossAmount
number	The gross price of the unit price. The value can contain up to 4 decimals.
taxRatePercentage
number	The tax rate of the unit price. See the "Supported tax rates" FAQ for more information and a list of possible values.. For vat-free sales vouchers the tax rate percentage must be 0.
Tax Conditions Details

Sample for vat-free tax conditions

"taxConditions": {
    "taxType": "constructionService13b",
    "taxTypeNote": "Steuerschuldnerschaft des Leistungsempfängers (Reverse Charge)"
}
                    Property	Description
taxType
enum	The tax type for the delivery note. Possible values are net, gross, vatfree (Steuerfrei), intraCommunitySupply (Innergemeinschaftliche Lieferung gem. §13b UStG), constructionService13b (Bauleistungen gem. §13b UStG), externalService13b (Fremdleistungen innerhalb der EU gem. §13b UStG), thirdPartyCountryService (Dienstleistungen an Drittländer), thirdPartyCountryDelivery (Ausfuhrlieferungen an Drittländer), and photovoltaicEquipment (0% taxation for photovoltaic equipment and installations in Germany starting 2023-01, Material und Leistungen für Photovoltaik-Installationen)
taxSubType
enum	A tax subtype. Only required for dedicated cases. For vouchers referencing a B2C customer in the EU, and with a taxType of net or gross, the taxSubType may be set to distanceSales, or electronicServices. Passing a null value results in a standard voucher.
If the organization's distanceSalesPrinciple (profile endpoint) is set to DESTINATION and this attribute is set to distanceSales or electronicServices, the voucher needs to reference the destination country's tax rates.
taxTypeNote
string	When taxType is set to a vat-free tax type then a note regarding the conditions can be set. When omitted Lexware sets the organization's default.
Related Vouchers Details

The relatedVouchers property documents all existing voucher relations for the current sales voucher. If no related vouchers exist, an empty list will be returned.

                    Property	Description
id
uuid	The related sales voucher's unique id.
voucherNumber
string	The specific number of the related sales voucher.
Read-only.
voucherType
string	Voucher type of the related sales voucher.
All attributes listed above are read-only.

Files Details

The files object with its property documentFileId is deprecated and will be removed.
                    Property	Description
documentFileId
uuid	The id of the order confirmation PDF. To download the order confirmation PDF file please use the files endpoint.
Create a Delivery Note
Sample request to create a delivery note

curl https://api.lexware.io/v1/delivery-notes
-X POST
-H "Authorization: Bearer {accessToken}"
-H "Content-Type: application/json"
-H "Accept: application/json"
-d '
{
  "archived": false,
  "voucherDate": "2023-02-22T00:00:00.000+01:00",
  "address": {
    "name": "Bike & Ride GmbH & Co. KG",
    "supplement": "Gebäude 10",
    "street": "Musterstraße 42",
    "city": "Freiburg",
    "zip": "79112",
    "countryCode": "DE"
  },
  "lineItems": [
    {
      "type": "custom",
      "name": "Abus Kabelschloss Primo 590 ",
      "description": "· 9,5 mm starkes, smoke-mattes Spiralkabel mit integrierter Halterlösung zur Befestigung am Sattelklemmbolzen · bewährter Qualitäts-Schließzylinder mit praktischem Wendeschlüssel · KabelØ: 9,5 mm, Länge: 150 cm",
      "quantity": 2,
      "unitName": "Stück",
      "unitPrice": null
    },
    {
      "type": "custom",
      "name": "Energieriegel Testpaket",
      "quantity": 1,
      "unitName": "Stück",
      "unitPrice": null
    },
    {
      "type": "text",
      "name": "Strukturieren Sie Ihre Belege durch Text-Elemente.",
      "description": "Das hilft beim Verständnis"
    }
  ],
  "taxConditions": {
    "taxType": "net"
  },
  "title": "Lieferschein",
  "introduction": "Lieferschein zur Rechnung RE-00020",
  "deliveryTerms": "Lieferung frei Haus.",
  "remark": "Folgende Lieferungen/Leistungen schreiben wir Ihnen gut."
}
'
Sample response

{
  "id": "e9066f04-8cc7-4616-93f8-ac9ecc8479c8",
  "resourceUri": "https://api.lexware.io/v1/delivery-notes/e9066f04-8cc7-4616-93f8-ac9ecc8479c8",
  "createdDate": "2023-06-17T18:32:07.480+02:00",
  "updatedDate": "2023-06-17T18:32:07.551+02:00",
  "version": 1
}
POST {resourceurl}/v1/delivery-notes[?finalize=true]

Delivery notes transmitted via the API are created in draft mode per default. To create a finalized delivery note with status open the optional query parameter finalize has to be set. The status of a delivery note cannot be changed via the api.

The created delivery note will be shown in the main voucher list in Lexware: https://app.lexware.de/vouchers. To provide your customers access to the created delivery note please use our deeplink function.

The contents of the delivery note are expected in the request's body as an application/json and must not contain read-only fields.

Description of required properties when creating a delivery note.

                    Property	Required	Notes
voucherDate	Yes	
address	Yes	Nested object. Required fields for address please see below.
lineItems	Yes	List of nested objects. Required fields for lineItems please see below.
taxConditions	Yes	Nested object. Required fields for taxConditions see below.
shippingConditions	Yes	Nested object. Required fields for shippingConditions see below.
Address Required Properties

Description of required address properties when creating a delivery note.

                    Property	Required	Notes
contactId	*	Only when referencing an existing Lexware contact.
name	*	Only required when no existing contact is referenced.
countryCode	*	Only required when no existing contact is referenced.
Line Items Required Properties

Description of required lineItem properties when creating a delivery note.

                    Property	Required	Notes
id	*	Required for type service and material.
type	Yes	Supported values are custom, material, service and text.
name	Yes	
quantity	*	Required for type custom, service and material.
unitName	*	Required for type custom, service and material.
unitPrice	No	Nested object. Required fields for unitPrice see below. Optional for delivery notes.
Unit Price Required Properties

Description of required unitPrice properties when creating a delivery note.

                    Property	Required	Notes
currency	Yes	
netAmount	*	Only relevant if taxConditions.taxType != gross is delivered.
grossAmount	*	Only relevant if taxConditions.taxType == gross is delivered.
taxRatePercentage	Yes	Must be 0 for vat-free sales voucher.
Tax Condition Required Properties

Description of required tax condition properties when creating a delivery note.

                    Property	Required	Notes
taxType	Yes	Supported values are: gross, net, vatfree, intraCommunitySupply, constructionService13b, externalService13b, thirdPartyCountryService, thirdPartyCountryDelivery.
Shipping Condition Required Properties

Description of required shipping condition properties when creating a delivery note.

                    Property	Required	Notes
shippingType	Yes	
shippingDate	*	Required for shipping types service, serviceperiod, delivery and deliveryperiod.
shippingEndDate	*	Required for shipping types serviceperiod and deliveryperiod.
Pursue to a Delivery Note
POST {resourceurl}/v1/delivery-notes?precedingSalesVoucherId={id}

To be able to pursue a sales voucher to a delivery note, the optional query parameter precedingSalesVoucherId needs to be set. The id value {id} refers to the preceding sales voucher which is going to be pursued.

To get an overview of the valid and possible pursue actions in Lexware, please see the linked sales voucher document chain. The recommended process is highlighted in blue. If the pursue action is not valid, the request will be rejected with 406 response.

If a quotation is referenced by the precedingSalesVoucherId which contains any alternative or optional line items, the request will be rejected with 406 response.
Also, if an order confirmation with the status draft is referenced by the precedingSalesVoucherId, the request will be rejected with 406 response.
Retrieve a Delivery Note
Sample request

curl https://api.lexware.io/v1/delivery-notes/e9066f04-8cc7-4616-93f8-ac9ecc8479c8
-X GET
-H "Authorization: Bearer {accessToken}"
-H "Accept: application/json"
Sample response


{
    "id": "e9066f04-8cc7-4616-93f8-ac9ecc8479c8",
    "organizationId": "aa93e8a8-2aa3-470b-b914-caad8a255dd8",
    "createdDate": "2023-06-17T18:32:07.480+02:00",
    "updatedDate": "2023-06-17T18:32:07.551+02:00",
    "version": 1,
    "language": "de",
    "archived": false,
    "voucherStatus": "draft",
    "voucherNumber": "LS0007",
    "voucherDate": "2023-02-22T00:00:00.000+01:00",
    "address": {
        "name": "Bike & Ride GmbH & Co. KG",
        "supplement": "Gebäude 10",
        "street": "Musterstraße 42",
        "city": "Freiburg",
        "zip": "79112",
        "countryCode": "DE"
    },
    "lineItems": [
        {
            "type": "custom",
            "name": "Abus Kabelschloss Primo 590 ",
            "description": "· 9,5 mm starkes, smoke-mattes Spiralkabel mit integrierter Halterlösung zur Befestigung am Sattelklemmbolzen · bewährter Qualitäts-Schließzylinder mit praktischem Wendeschlüssel · KabelØ: 9,5 mm, Länge: 150 cm",
            "quantity": 2,
            "unitName": "Stück",
            "unitPrice": {
                "currency": "EUR",
                "netAmount": 13.4,
                "grossAmount": 15.946,
                "taxRatePercentage": 19
            }
        },
        {
            "type": "custom",
            "name": "Energieriegel Testpaket",
            "quantity": 1,
            "unitName": "Stück",
            "unitPrice": {
                "currency": "EUR",
                "netAmount": 5,
                "grossAmount": 5,
                "taxRatePercentage": 0
            }
        }
    ],
    "taxConditions": {
        "taxType": "net"
    },
    "title": "Lieferschein",
    "introduction": "Lieferschein zur Rechnung RE-00020",
    "deliveryTerms": "Lieferung frei Haus.",
    "remark": "Folgende Lieferungen/Leistungen schreiben wir Ihnen gut."
}
GET {resourceurl}/v1/delivery-notes/{id}

Returns the delivery note with id value {id}.

Render a Delivery Note Document (PDF)
This endpoint is deprecated and should no longer be used. Instead, use the delivery note file subresource to directly download the document by specifying the id of the delivery note.
Sample request

curl https://api.lexware.io/v1/delivery-notes/e9066f04-8cc7-4616-93f8-ac9ecc8479c8/document
-X GET
-H "Authorization: Bearer {accessToken}"
-H "Accept: application/json"
Sample response

{
  "documentFileId": "b26e1d73-19ff-46b1-8929-09d8d73d4167"
}
GET {resourceurl}/v1/delivery-notes/{id}/document

To download the PDF file of a delivery note document, you need its documentFileId. This id is usually returned by the delivery note resource. However, PDF document file rendering must be triggered separately via this endpoint for delivery notes created through the API with the status open.

The returned documentFileId can be used to download the delivery note PDF document via the (Files Endpoint).

For delivery notes in draft mode, there does not exist a document file in Lexware. Any request attempts are rejected with 406 responses.
Download a Delivery Note File
GET {resourceurl}/v1/delivery-notes/{id}/file

Sample request to download a delivery note file

curl "https://api.lexware.io/v1/delivery-notes/{id}/file"
-X GET
-H "Accept: */*"
-H "Authorization: Bearer {accessToken}"
Returns the file as binary data with HTTP response code 200. The HTTP header fields Content-Type specifies the file type (MIME type) and the Content-Length the size of the file in bytes. A suggested file name is returned in the header Content-Disposition.

For a delivery note, only PDF files are supported. As Accept header, */* and application/pdf can be used. Accept headers with wildcards are also supported and will return the default representation.

If the delivery note itself does not exist, the request will be rejected with 404 Not Found.

Requests for other media types will generally be rejected with an HTTP status of 406 Not Acceptable.

For delivery notes in draft mode, there does not exist a document file in Lexware. Any request attempts are rejected with 409 responses.
Deeplink to a Delivery Note
Delivery notes can be directly accessed by permanent HTTPS links to either be viewed or to be edited. If a delivery note is not allowed to be edited, a redirection to the view page takes place. In case the given id does not exist, a redirection to the main voucher list takes place.

View URL {appbaseurl}/permalink/delivery-notes/view/{id}

Edit URL {appbaseurl}/permalink/delivery-notes/edit/{id}

Dunnings Endpoint
Purpose
This endpoint provides read and write access to dunnings and also the possibility to render the document as a PDF in order to download it. Dunnings are always created in draft mode and do not need to be finalized.

A dunning requires an invoice as a reference, making the precedingSalesVoucherId a mandatory query parameter. When creating a dunning, the contact ids of the invoice and the dunning must be equal (or both be absent, resulting in a reference to the collective customer). The name attribute in the address field is copied from the referenced invoice and will be ignored in the dunning structure. The tax conditions must match the tax conditions in the referenced invoice.

Dunning a down payment invoice is possible as well.

Dunnings Properties
Sample of a dunning with multiple line items. Fields with no content are displayed with "null" just for demonstration purposes.

{
   "id":"e9066f04-8cc7-4616-93f8-ac9ecc8479c8",
   "organizationId":"aa93e8a8-2aa3-470b-b914-caad8a255dd8",
   "createdDate":"2023-07-17T18:32:07.480+02:00",
   "updatedDate":"2023-07-17T18:32:07.551+02:00",
   "version":1,
   "language":"de",
   "archived":false,
   "voucherStatus":"draft",
   "voucherDate":"2023-07-17T00:00:00.000+02:00",
   "address":{
      "supplement":"Gebäude 10",
      "street":"Musterstraße 42",
      "city":"Freiburg",
      "zip":"79112",
      "countryCode":"DE"
   },
   "electronicDocumentProfile":"NONE",
   "lineItems":[
      {
         "type": "custom",
         "name": "Energieriegel Testpaket",
         "quantity": 1,
         "unitName": "Stück",
         "unitPrice": {
            "currency": "EUR",
            "netAmount": 5,
            "grossAmount": 5.0,
            "taxRatePercentage": 0.0
         },
         "discountPercentage": 0,
         "lineItemAmount": 5.0
      },
      {
         "type": "text",
         "name": "Strukturieren Sie Ihre Belege durch Text-Elemente.",
         "description": "Das hilft beim Verst\u00e4ndnis"
      }
   ],
   "totalPrice": {
       "currency": "EUR",
       "totalNetAmount": 5.0,
       "totalGrossAmount": 5.0,
       "totalTaxAmount": 0.0
   },
   "taxAmounts": [
       {
           "taxRatePercentage": 0.0,
           "taxAmount": 0.0,
           "netAmount": 5.0
       }
   ],
   "taxConditions": {
       "taxType": "net"
   },
   "shippingConditions": {
       "shippingDate": "2023-07-21T15:16:44.051+02:00",
       "shippingType": "delivery"
   },
   "relatedVouchers": [
       {
           "id": "52cd26a2-ea26-11eb-a4f0-2bb179f80c5a",
           "voucherNumber": "RE0357",
           "voucherType": "invoice"
       }
   ],
   "printLayoutId": "28c212c4-b6dd-11ee-b80a-dbc65f4ceccf",
   "introduction": "Wir bitten Sie, die nachfolgend aufgelisteten Lieferungen/Leistungen unverzüglich zu begleichen.",
   "remark": "Sollten Sie den offenen Betrag bereits beglichen haben, betrachten Sie dieses Schreiben als gegenstandslos.",
   "files": {
       "documentFileId": "4e19354c-ea26-11eb-a31f-af2d58e85357"
   },
   "title": "Mahnung"
}
                    Property	Description
id
uuid	Unique id generated on creation by Lexware.
Read-only.
organizationId
uuid	Unique id of the organization the dunning belongs to.
Read-only.
createdDate
dateTime	The instant of time when the dunning was created by Lexware in format yyyy-MM-ddTHH:mm:ss.SSSXXX as described in RFC 3339/ISO 8601 (e.g. 2023-02-21T00:00:00.000+01:00).
Read-only.
updatedDate
dateTime	The instant of time when the dunning was updated by Lexware in format yyyy-MM-ddTHH:mm:ss.SSSXXX as described in RFC 3339/ISO 8601 (e.g. 2023-02-21T00:00:00.000+01:00).
Read-only.
version
integer	Version (revision) number which will be increased on each change to handle optimistic locking.
Read-only.
language
string	Specifies the language of the dunning which affects the print document but also set translated default text modules when no values are send (e.g. for introduction). Values accepted in ISO 639-1 code. Possible values are German de (default) and English en.
archived
boolean	Specifies if the dunning is only available in the archive in Lexware.
Read-only.
voucherStatus
enum	Specifies the status of the dunning. The only possible status is draft (is editable).
Read-only.
voucherDate
dateTime	The date of dunning in format yyyy-MM-ddTHH:mm:ss.SSSXXX as described in RFC 3339/ISO 8601 (e.g. 2023-02-21T00:00:00.000+01:00).
address
object	The address of the dunning recipient. For details see below.
electronicDocumentProfile
enum	The electronic document profile of the dunning. Always contains the value NONE.
Read-only.
lineItems
list	The items of the dunning. For details see below.
taxConditions
object	The tax conditions of the dunning. Need to match the tax conditions of the preceding invoice. For details see below.
shippingConditions
object	The shipping conditions of the dunning. For details see below.
relatedVouchers
list	The related vouchers of the dunning. Read-only.
printLayoutId
uuid	(Optional) The id of the print layout to be used for the dunning. The organization's default print layout will be used if no value is sent.
title
string	(Optional) A title text. The organization's default is used if no value was sent.
introduction
string	(Optional) An introductory text / header. The organization's default is used if no value was sent. We recommended to include the invoice number in the header when the dunning is related to an invoice.
remark
string	(Optional) A closing text note. The organization's default is used if no value was sent.
files
object	(Deprecated, will be removed) The document id for the PDF version of the dunning. For details see below.
Read-only.
Compared to invoices, dunnings do not have payment conditions, a due date, or a voucher number. The latter is derived from the related invoice.
Address Details

There are two main options to address the recipient of a dunning. First, using an existing Lexware contact or second, creating a new address.

For referencing an existing contact it is only necessary to provide the UUID of that contact. Usually the billing address is used (for delivery notes, the shipping address will be preferred). Additionally, the referenced address can also be modified for this specific dunning. This can be done by setting all required address fields and this deviated address will not be stored back to the Lexware contacts.

The referenced contact needs to have the role customer. For more information please refer to the contacts endpoint.
Otherwise, a new address for the dunning recipient can be created. That type of address is called a "one-time address". A one-time address will not create a new contact in Lexware. For instance, this could be useful when it is not needed to create a contact in Lexware for each new dunning.

Please get in touch with us if you are not sure which option fits your use case best.

                    Property	Description
contactId
uuid	If the dunning recipient is (optionally) registered as a contact in Lexware, this field specifies the related id of the contact.
name
string	The name of the dunning recipient. To use an existing contact of an individual person, provide the name in the format {firstname} {lastname}.
supplement
string	(Optional) An address supplement.
street
string	The street (street and street number) of the address.
city
string	The city of the address.
zip
string	The zip code of the address.
countryCode
enum	The ISO 3166 alpha2 country code of the address.
contactPerson
string	The contact person selected while editing the voucher. The primary contact person will be used when creating vouchers via the API with a referenced contactId.
Read-only.
If the invoice referenced by the dunning contained a contactId, the same contactId needs to be included in the dunning. If the invoice was created using a one-time contact, the dunning needs to do so as well. In any case, the name attribute of the invoice address record will be used in the dunning, independently of the attribute in the dunning.
Line Items Details

A maximum of 300 line items can be used in a single dunning.
For referencing an existing product or service, it is necessary to provide its UUID. However, all required properties must still be specified for the referencing line item. Additionally, the referenced product or service can be modified by adjusting the input. This deviated data will not be stored back to the product/service in Lexware.

                    Property	Description
id
uuid	The field specifies the related id of a referenced product/service.
type
enum	The type of the item. Possible values are service (the line item is related to a supply of services), material (the line item is related to a physical product), custom (an item without reference in Lexware and has no id) or text (contains only a name and/or a description for informative purposes).
name
string	The name of the item.
description
string	The description of the item.
quantity
number	The amount of the purchased item. The value can contain up to 4 decimals.
unitName
string	The unit name of the purchased item. If the provided unit name is not known in Lexware it will be created on the fly.
unitPrice
object	The unit price of the purchased item. For details see below.
lineItemAmount
number	The total price of this line item. Depending by the selected taxType in taxConditions, the amount must be given either as net or gross. The value can contain up to 2 decimals.
Read-only.
Unit Price Details

                    Property	Description
currency
enum	The currency of the price. Currently only EUR is supported.
netAmount
number	The net price of the unit price. The value can contain up to 4 decimals.
grossAmount
number	The gross price of the unit price. The value can contain up to 4 decimals.
taxRatePercentage
number	The tax rate of the unit price. See the "Supported tax rates" FAQ for more information and a list of possible values.. For vat-free sales vouchers the tax rate percentage must be 0.
Tax Conditions Details

Sample for vat-free tax conditions

"taxConditions": {
    "taxType": "constructionService13b",
    "taxTypeNote": "Steuerschuldnerschaft des Leistungsempfängers (Reverse Charge)"
}
                    Property	Description
taxType
enum	The tax type for the dunning. Possible values are net, gross, vatfree (Steuerfrei), intraCommunitySupply (Innergemeinschaftliche Lieferung gem. §13b UStG), constructionService13b (Bauleistungen gem. §13b UStG), externalService13b (Fremdleistungen innerhalb der EU gem. §13b UStG), thirdPartyCountryService (Dienstleistungen an Drittländer), thirdPartyCountryDelivery (Ausfuhrlieferungen an Drittländer), and photovoltaicEquipment (0% taxation for photovoltaic equipment and installations in Germany starting 2023-01, Material und Leistungen für Photovoltaik-Installationen)
taxSubType
enum	A tax subtype. Only required for dedicated cases. For vouchers referencing a B2C customer in the EU, and with a taxType of net or gross, the taxSubType may be set to distanceSales, or electronicServices. Passing a null value results in a standard voucher.
If the organization's distanceSalesPrinciple (profile endpoint) is set to DESTINATION and this attribute is set to distanceSales or electronicServices, the voucher needs to reference the destination country's tax rates.
taxTypeNote
string	When taxType is set to a vat-free tax type then a note regarding the conditions can be set. When omitted Lexware sets the organization's default.
Shipping Conditions Details

                    Property	Description
shippingDate
dateTime	The instant of time when the purchased items have to be shipped. Value in format yyyy-MM-ddTHH:mm:ss.SSSXXX as described in RFC 3339/ISO 8601 (e.g. 2023-02-21T00:00:00.000+01:00).
shippingEndDate
dateTime	An end instant in order to specify a shipping period of time. Value in format yyyy-MM-ddTHH:mm:ss.SSSXXX as described in RFC 3339/ISO 8601 (e.g. 2023-02-21T00:00:00.000+01:00). Must not specify an instant before shippingDate.
shippingType
enum	The type of the shipping. Possible values are service (a service is supplied on shippingDate), serviceperiod (a service is supplied within the period [shippingDate,shippingEndDate] ), delivery (a product is delivered), deliveryperiod (a product is delivered within the period [shippingDate,shippingEndDate]) and none (no shipping date has to be provided)
Related Vouchers Details

The relatedVouchers property documents all existing voucher relations for the current sales voucher. If no related vouchers exist, an empty list will be returned.

                    Property	Description
id
uuid	The related sales voucher's unique id.
voucherNumber
string	The specific number of the related sales voucher.
Read-only.
voucherType
string	Voucher type of the related sales voucher.
All attributes listed above are read-only.

Files Details

The files object with its property documentFileId is deprecated and will be removed.
                    Property	Description
documentFileId
uuid	The id of the order confirmation PDF. To download the order confirmation PDF file please use the files endpoint.
Create a dunning
Sample request to create a dunning

curl https://api.lexware.io/v1/dunnings?precedingSalesVoucherId=58e512ce-ea13-11eb-bac8-2f511e28942a
-X POST
-H "Authorization: Bearer {accessToken}"
-H "Content-Type: application/json"
-H "Accept: application/json"
-d '
{
  "archived": false,
  "voucherDate": "2023-07-22T00:00:00.000+02:00",
  "address": {
    "name": "Bike & Ride GmbH & Co. KG",
    "supplement": "Gebäude 10",
    "street": "Musterstraße 42",
    "city": "Freiburg",
    "zip": "79112",
    "countryCode": "DE"
  },
  "lineItems": [
    {
      "type": "custom",
      "name": "Energieriegel Testpaket",
      "quantity": 1,
      "unitName": "Stück",
      "unitPrice": {
        "currency": "EUR",
        "netAmount": 5,
        "taxRatePercentage": 0
      },
      "discountPercentage": 0
    },
    {
      "type": "text",
      "name": "Strukturieren Sie Ihre Belege durch Text-Elemente.",
      "description": "Das hilft beim Verständnis"
    }
  ],
  "totalPrice": {
    "currency": "EUR",
    "totalNetAmount": 15.0,
    "totalGrossAmount": 17.85,
    "totalTaxAmount": 2.85
  },
  "taxConditions": {
    "taxType": "net"
  },
  "title": "Mahnung",
  "introduction": "Wir bitten Sie, die nachfolgend aufgelisteten Lieferungen/Leistungen unverzüglich zu begleichen.",
  "remark": "Sollten Sie den offenen Betrag bereits beglichen haben, betrachten Sie dieses Schreiben als gegenstandslos."
}
'
Sample response

{
  "id": "d9066f04-8cc7-4616-93f8-ac9ecc8479c9",
  "resourceUri": "https://api.lexware.io/v1/dunnings/d9066f04-8cc7-4616-93f8-ac9ecc8479c9",
  "createdDate": "2023-07-17T18:32:07.480+02:00",
  "updatedDate": "2023-07-17T18:32:07.551+02:00",
  "version": 1
}
POST {resourceurl}/v1/dunnings?precedingSalesVoucherId={id}

The created dunning will not be shown in the main voucher list in Lexware, but will be attached to an invoice and will be visible there. To provide your customers access to the created dunning please use our deeplink function.

The contents of the dunning are expected in the request's body as an application/json and must not contain read-only fields. See our FAQ on further information on text fields.

Description of required properties when creating a dunning.

                    Property	Required	Notes
voucherDate	Yes	
address	Yes	Nested object. Required fields for address please see below.
lineItems	Yes	List of nested objects. Required fields for lineItems please see below.
taxConditions	Yes	Nested object. Required fields for taxConditions see below.
shippingConditions	Yes	Nested object. Required fields for shippingConditions see below.
totalPrice	Yes	Nested object. Required fields for totalPrice please see below.
Address Required Properties

Description of required address properties when creating a dunning.

                    Property	Required	Notes
contactId	*	Only when referencing an existing Lexware contact.
name	*	Only required when no existing contact is referenced.
countryCode	*	Only required when no existing contact is referenced.
Line Items Required Properties

Description of required lineItem properties when creating a dunning.

                    Property	Required	Notes
id	*	Required for type service and material.
type	Yes	Supported values are custom, material, service and text.
name	Yes	
quantity	*	Required for type custom, service and material.
unitName	*	Required for type custom, service and material.
unitPrice	*	Required for type custom, service and material. Nested object. Required fields for unitPrice see below.
Unit Price Required Properties

Description of required unitPrice properties when creating a dunning.

                    Property	Required	Notes
currency	Yes	
netAmount	*	Only relevant if taxConditions.taxType != gross is delivered.
grossAmount	*	Only relevant if taxConditions.taxType == gross is delivered.
taxRatePercentage	Yes	Must be 0 for vat-free sales voucher.
Tax Condition Required Properties

Description of required tax condition properties when creating a dunning.

                    Property	Required	Notes
taxType	Yes	Supported values are: gross, net, vatfree, intraCommunitySupply, constructionService13b, externalService13b, thirdPartyCountryService, thirdPartyCountryDelivery.
Total Price Required Properties

Description of required totalPrice properties when creating a dunning.

                    Property	Required	Notes
currency	Yes	
Shipping Condition Required Properties

Description of required shipping condition properties when creating a dunning.

                    Property	Required	Notes
shippingType	Yes	
shippingDate	*	Required for shipping types service, serviceperiod, delivery and deliveryperiod.
shippingEndDate	*	Required for shipping types serviceperiod and deliveryperiod.
Pursue to a dunning
POST {resourceurl}/v1/dunnings?precedingSalesVoucherId={id}

To be able to pursue a sales voucher to a dunning, the optional query parameter precedingSalesVoucherId needs to be set. The id value {id} refers to the preceding sales voucher which is going to be pursued.

To get an overview of the valid and possible pursue actions in Lexware, please see the linked sales voucher document chain. The recommended process is highlighted in blue. If the pursue action is not valid, the request will be rejected with 406 response.

Retrieve a dunning
Sample request

curl https://api.lexware.io/v1/dunnings/a54820ca-ea27-11eb-8703-dffc93413c04
-X GET
-H "Authorization: Bearer {accessToken}"
-H "Accept: application/json"
Sample response


{
    "id": "e7f66576-d5c8-4dbd-9a01-c2c4d6695da6",
    "organizationId": "aa93e8a8-2aa3-470b-b914-caad8a255dd8",
    "createdDate": "2023-07-21T15:26:51.469+02:00",
    "updatedDate": "2023-07-21T15:26:51.548+02:00",
    "version": 2,
    "language": "de",
    "archived": false,
    "voucherStatus": "draft",
    "voucherDate": "2023-07-22T01:00:00.000+02:00",
    "address": {
        "name": "Bike & Ride GmbH & Co. KG",
        "supplement": "Gebäude 10",
        "street": "Musterstraße 42",
        "city": "Freiburg",
        "zip": "79112",
        "countryCode": "DE"
    },
    "lineItems": [
        {
            "type": "custom",
            "name": "Energieriegel Testpaket",
            "quantity": 1,
            "unitName": "Stück",
            "unitPrice": {
                "currency": "EUR",
                "netAmount": 5,
                "grossAmount": 5.0,
                "taxRatePercentage": 0.0
            },
            "discountPercentage": 0,
            "lineItemAmount": 5.0
        },
        {
            "type": "text",
            "name": "Strukturieren Sie Ihre Belege durch Text-Elemente.",
            "description": "Das hilft beim Verst\u00e4ndnis"
        }
    ],
    "totalPrice": {
        "currency": "EUR",
        "totalNetAmount": 5.0,
        "totalGrossAmount": 5.0,
        "totalTaxAmount": 0.0
    },
    "taxAmounts": [
        {
            "taxRatePercentage": 0.0,
            "taxAmount": 0.0,
            "netAmount": 5.0
        }
    ],
    "taxConditions": {
        "taxType": "net"
    },
    "shippingConditions": {
        "shippingDate": "2023-05-22T00:00:00.000+02:00",
        "shippingType": "delivery"
    },
    "relatedVouchers": [
        {
            "id": "ddc4c966-aae0-4e0e-a229-3ec9085ee9a3",
            "voucherNumber": "RE0357",
            "voucherType": "invoice"
        }
    ],
    "introduction": "Wir bitten Sie, die nachfolgend aufgelisteten Lieferungen/Leistungen unverzüglich zu begleichen.",
    "remark": "Sollten Sie den offenen Betrag bereits beglichen haben, betrachten Sie dieses Schreiben als gegenstandslos.",
    "title": "Mahnung"
}
GET {resourceurl}/v1/dunnings/{id}

Returns the dunning with id value {id}.

Render a dunning Document (PDF)
This endpoint is deprecated and should no longer be used. Instead, use the dunning file subresource to directly download the document by specifying the id of the dunning.
Sample request

curl https://api.lexware.io/v1/dunnings/e9066f04-8cc7-4616-93f8-ac9ecc8479c8/document
-X GET
-H "Authorization: Bearer {accessToken}"
-H "Accept: application/json"
Sample response

{
  "documentFileId": "b26e1d73-19ff-46b1-8929-09d8d73d4167"
}
GET {resourceurl}/v1/dunnings/{id}/document

To download the PDF file of a dunning document, you need its documentFileId. This id is usually returned by the dunning resource. However, PDF document file rendering must be triggered separately via this endpoint for dunnings created through the API.

The returned documentFileId can be used to download the dunning PDF document via the (Files Endpoint).

Download a Dunning File
GET {resourceurl}/v1/dunnings/{id}/file

Sample request to download a dunning file

curl "https://api.lexware.io/v1/dunnings/{id}/file"
-X GET
-H "Accept: */*"
-H "Authorization: Bearer {accessToken}"
Returns the file as binary data with HTTP response code 200. The HTTP header fields Content-Type specifies the file type (MIME type) and the Content-Length the size of the file in bytes. A suggested file name is returned in the header Content-Disposition.

For a dunning, only PDF files are supported. As Accept header, */* and application/pdf can be used. Accept headers with wildcards are also supported and will return the default representation.

If the dunning itself does not exist, the request will be rejected with 404 Not Found.

Requests for other media types will generally be rejected with an HTTP status of 406 Not Acceptable.

Deeplink to a dunning
Dunnings can be directly accessed by permanent HTTPS links to either be viewed or to be edited. If a dunning is not allowed to be edited, a redirection to the view page takes place. In case the given id does not exist, a redirection to the main voucher list takes place.

View URL {appbaseurl}/permalink/dunnings/view/{id}

Edit URL {appbaseurl}/permalink/dunnings/edit/{id}

Down Payment Invoices Endpoint
Purpose
This endpoint provides read-only access to down payment invoices.

Down Payment Invoices Properties
Most properties of down payment invoices are identical with the ones of regular invoices.

Sample of a down payment invoice. Fields with no content are displayed with "null" just for demonstration purposes.

{
  "id": "0333f0c7-2b89-4889-b64e-68b3ca3f167a",
  "organizationId": "aa93e8a8-2aa3-470b-b914-caad8a255dd8",
  "createdDate": "2023-01-20T10:26:40.956+01:00",
  "updatedDate": "2023-01-21T13:34:13.228+01:00",
  "version": 3,
  "language": "de",
  "archived": false,
  "voucherStatus": "open",
  "voucherNumber": "RE1129",
  "voucherDate": "2023-01-20T10:26:26.565+01:00",
  "dueDate": "2023-02-19T00:00:00.000+01:00",
  "address": {
    "name": "Bike & Ride GmbH & Co. KG",
    "supplement": "Gebäude 10",
    "street": "Musterstraße 42",
    "city": "Freiburg",
    "zip": "79112",
    "countryCode": "DE"
  },
  "electronicDocumentProfile":"NONE",
  "lineItems": [
    {
      "type": "custom",
      "name": "Pauschaler Abschlag",
      "quantity": 1,
      "unitPrice": {
        "currency": "EUR",
        "netAmount": 559.66,
        "grossAmount": 666,
        "taxRatePercentage": 19
      },
      "lineItemAmount": 666.00
    }
  ],
  "totalPrice": {
    "currency": "EUR",
    "totalNetAmount": 559.66,
    "totalGrossAmount": 666.00,
    "totalTaxAmount": 106.34
  },
  "taxAmounts": [
    {
      "taxRatePercentage": 19,
      "taxAmount": 106.34,
      "netAmount": 559.66
    }
  ],
  "taxConditions": {
    "taxType": "gross"
  },
  "paymentConditions": {
    "paymentTermLabel": "10 Tage - 3 %, 30 Tage netto",
    "paymentTermLabelTemplate": "{discountRange} Tage -{discount}, {paymentRange} Tage netto",
    "paymentTermDuration": 30,
    "paymentDiscountConditions": {
      "discountPercentage": 3,
      "discountRange": 10
    }
  },
  "shippingConditions": {
    "shippingType": "none"
  },
  "closingInvoiceId": null,
  "relatedVouchers": [],
  "printLayoutId": "28c212c4-b6dd-11ee-b80a-dbc65f4ceccf",
  "introduction": "Wie vereinbart, erlauben wir uns folgenden pauschalen Abschlag in Rechnung zu stellen.",
  "remark": "Vielen Dank für die gute Zusammenarbeit.",
  "files": {
    "documentFileId": "aa0388c5-20b5-49d7-96ce-0c08ac0482f4"
  },
  "title": "1. Abschlagsrechnung"
}
All attributes are read-only, as down payment invoices cannot be created or modified by means of the API.

                    Property	Description
id
uuid	Unique id generated on creation by Lexware.
organizationId
uuid	Unique id of the organization the down payment invoice belongs to.
createdDate
dateTime	The instant of time when the down payment invoice was created by Lexware in format yyyy-MM-ddTHH:mm:ss.SSSXXX as described in RFC 3339/ISO 8601 (e.g. 2023-02-21T00:00:00.000+01:00).
Read-only.
updatedDate
dateTime	The instant of time when the down payment invoice was updated by Lexware in format yyyy-MM-ddTHH:mm:ss.SSSXXX as described in RFC 3339/ISO 8601 (e.g. 2023-02-21T00:00:00.000+01:00).
Read-only.
version
integer	Version (revision) number which will be increased on each change to handle optimistic locking.
Read-only.
language
string	Specifies the language of the down payment invoice which affects the print document but also set translated default text modules when no values are send (e.g. for introduction). Values accepted in ISO 639-1 code. Possible values are German de (default) and English en.
archived
boolean	Specifies if the down payment invoice is only available in the archive in Lexware.
voucherStatus
enum	Specifies the status of the down payment invoice. Possible values are draft (is editable), open (finalized and no longer editable but yet unpaid or only partially paid), paid (has been fully paid), voided (cancelled)
voucherNumber
string	The specific number a down payment invoice is aware of. This consecutive number is set by Lexware on creation.
voucherDate
dateTime	The date of the down payment invoice in format yyyy-MM-ddTHH:mm:ss.SSSXXX as described in RFC 3339/ISO 8601 (e.g. 2023-02-21T00:00:00.000+01:00).
dueDate
dateTime	Sets the date on which the down payment invoice is payable before becoming overdue in format yyyy-MM-ddTHH:mm:ss.SSSXXX as described in RFC 3339/ISO 8601 (e.g. 2023-02-21T00:00:00.000+01:00).
address
object	The address of the down payment invoice recipient. For details see below.
electronicDocumentProfile
enum	The electronic document profile of the down payment invoice. Possible values are NONE (no electronic document profile, also returned for non-invoice sales vouchers and draft invoices), EN16931 (ZUGFeRD), and XRechnung (XRechnung enabled invoice).
Read-only.
lineItems
list	The items of the down payment invoice. For down payment invoices, this list contains exactly one item. For details see below.
totalPrice
object	The total price of the down payment invoice. For details see below.
taxAmounts
list	The tax amounts for each tax rate. Please note: As done with every read-only element or object all submitted content (POST) will be ignored. For details see below.
taxConditions
object	The tax conditions of the down payment invoice. For details see below.
paymentConditions
object	The payment conditions of the down payment invoice. The organization's (or contact-specific) default is used if no value was sent. For details see below.
shippingConditions
object	The shipping conditions of the invoice. For details see below.
closingInvoiceId
UUID	Id of the closing invoice that references this down payment invoice, if one exists. Null otherwise.
relatedVouchers
list	The related vouchers of the down payment invoice. Read-only.
printLayoutId
uuid	(Optional) The id of the print layout to be used for the down payment invoice. The organization's default print layout will be used if no value is sent.
title
string	(Optional) A title text. The organization's default is used if no value was sent.
introduction
string	(Optional) An introductory text / header. The organization's default is used if no value was sent.
remark
string	(Optional) A closing text note. The organization's default is used if no value was sent.
files
object	(Deprecated, will be removed) The document id for the PDF version of the down payment invoice. For details see below.
Address Details

There are two main options to address the recipient of a down payment invoice. First, using an existing Lexware contact or second, creating a new address.

For referencing an existing contact it is only necessary to provide the UUID of that contact. Usually the billing address is used (for delivery notes, the shipping address will be preferred). Additionally, the referenced address can also be modified for this specific down payment invoice. This can be done by setting all required address fields and this deviated address will not be stored back to the Lexware contacts.

The referenced contact needs to have the role customer. For more information please refer to the contacts endpoint.
Otherwise, a new address for the down payment invoice recipient can be created. That type of address is called a "one-time address". A one-time address will not create a new contact in Lexware. For instance, this could be useful when it is not needed to create a contact in Lexware for each new down payment invoice.

Please get in touch with us if you are not sure which option fits your use case best.

                    Property	Description
contactId
uuid	If the down payment invoice recipient is (optionally) registered as a contact in Lexware, this field specifies the related id of the contact.
name
string	The name of the down payment invoice recipient. To use an existing contact of an individual person, provide the name in the format {firstname} {lastname}.
supplement
string	(Optional) An address supplement.
street
string	The street (street and street number) of the address.
city
string	The city of the address.
zip
string	The zip code of the address.
countryCode
enum	The ISO 3166 alpha2 country code of the address.
contactPerson
string	The contact person selected while editing the voucher. The primary contact person will be used when creating vouchers via the API with a referenced contactId.
Read-only.
Line Items Details

A maximum of 300 line items can be used in a single down payment invoice.
For referencing an existing product or service, it is necessary to provide its UUID. However, all required properties must still be specified for the referencing line item. Additionally, the referenced product or service can be modified by adjusting the input. This deviated data will not be stored back to the product/service in Lexware.

                    Property	Description
id
uuid	The field specifies the related id of a referenced product/service.
type
enum	The type of the item. Possible values are service (the line item is related to a supply of services), material (the line item is related to a physical product), custom (an item without reference in Lexware and has no id) or text (contains only a name and/or a description for informative purposes).
name
string	The name of the item.
description
string	The description of the item.
quantity
number	The amount of the purchased item. The value can contain up to 4 decimals.
unitName
string	The unit name of the purchased item. If the provided unit name is not known in Lexware it will be created on the fly.
unitPrice
object	The unit price of the purchased item. For details see below.
discountPercentage
number	The offered discount for the item. The value can contain up to 2 decimals.
lineItemAmount
number	The total price of this line item. Depending by the selected taxType in taxConditions, the amount must be given either as net or gross. The value can contain up to 2 decimals.
Read-only.
Unit Price Details

                    Property	Description
currency
enum	The currency of the price. Currently only EUR is supported.
netAmount
number	The net price of the unit price. The value can contain up to 4 decimals.
grossAmount
number	The gross price of the unit price. The value can contain up to 4 decimals.
taxRatePercentage
number	The tax rate of the unit price. See the "Supported tax rates" FAQ for more information and a list of possible values.. For vat-free sales vouchers the tax rate percentage must be 0.
Total Price Details

                    Property	Description
currency
string	The currency of the total price. Currently only EUR is supported.
totalNetAmount
number	The total net price over all line items. The value can contain up to 2 decimals.
Read-only.
totalGrossAmount
number	The total gross price over all line items. The value can contain up to 2 decimals.
Read-only.
totalTaxAmount
number	The total tax amount over all line items. The value can contain up to 2 decimals.
Read-only.
totalDiscountAbsolute
number	(Optional) A total discount as absolute value. The value can contain up to 2 decimals.
totalDiscountPercentage
number	(Optional) A total discount relative to the gross amount or net amount dependent on the given tax conditions. A contact-specific default will be set if available and no total discount was send. The value can contain up to 2 decimals.
Tax Amounts Details

                    Property	Description
taxRatePercentage
number	Tax rate as percentage value. See the "Supported tax rates" FAQ for more information and a list of possible values..
taxAmount
number	The total tax amount for this tax rate. The value can contain up to 2 decimals.
netAmount
number	The total net amount for this tax rate. The value can contain up to 2 decimals.
Tax Conditions Details

Sample for vat-free tax conditions

"taxConditions": {
    "taxType": "constructionService13b",
    "taxTypeNote": "Steuerschuldnerschaft des Leistungsempfängers (Reverse Charge)"
}
                    Property	Description
taxType
enum	The tax type for the down payment invoice. Possible values are net, gross, vatfree (Steuerfrei), intraCommunitySupply (Innergemeinschaftliche Lieferung gem. §13b UStG), constructionService13b (Bauleistungen gem. §13b UStG), externalService13b (Fremdleistungen innerhalb der EU gem. §13b UStG), thirdPartyCountryService (Dienstleistungen an Drittländer), thirdPartyCountryDelivery (Ausfuhrlieferungen an Drittländer), and photovoltaicEquipment (0% taxation for photovoltaic equipment and installations in Germany starting 2023-01, Material und Leistungen für Photovoltaik-Installationen)
taxSubType
enum	A tax subtype. Only required for dedicated cases. For vouchers referencing a B2C customer in the EU, and with a taxType of net or gross, the taxSubType may be set to distanceSales, or electronicServices. Passing a null value results in a standard voucher.
If the organization's distanceSalesPrinciple (profile endpoint) is set to DESTINATION and this attribute is set to distanceSales or electronicServices, the voucher needs to reference the destination country's tax rates.
taxTypeNote
string	When taxType is set to a vat-free tax type then a note regarding the conditions can be set. When omitted Lexware sets the organization's default.
Payment Conditions Details

The payment conditions are optional and the organization's or contact-specific defaults will be used if ommitted.

                    Property	Description
paymentTermLabel
string	A textual note regarding the payment conditions.
paymentTermLabelTemplate
string	A textual note regarding the payment conditions. This label template may contain variables such as the discount range. These variables are enclosed in curly braces, e.g., {discountRange}.'
Read-only.
paymentTermDuration
integer	The time left (in days) until the payment must be conducted.
Shipping Conditions Details

                    Property	Description
shippingDate
dateTime	The instant of time when the purchased items have to be shipped. Value in format yyyy-MM-ddTHH:mm:ss.SSSXXX as described in RFC 3339/ISO 8601 (e.g. 2023-02-21T00:00:00.000+01:00).
shippingEndDate
dateTime	An end instant in order to specify a shipping period of time. Value in format yyyy-MM-ddTHH:mm:ss.SSSXXX as described in RFC 3339/ISO 8601 (e.g. 2023-02-21T00:00:00.000+01:00). Must not specify an instant before shippingDate.
shippingType
enum	The type of the shipping. Possible values are service (a service is supplied on shippingDate), serviceperiod (a service is supplied within the period [shippingDate,shippingEndDate] ), delivery (a product is delivered), deliveryperiod (a product is delivered within the period [shippingDate,shippingEndDate]) and none (no shipping date has to be provided)
Related Vouchers Details

The relatedVouchers property documents all existing voucher relations for the current sales voucher. If no related vouchers exist, an empty list will be returned.

                    Property	Description
id
uuid	The related sales voucher's unique id.
voucherNumber
string	The specific number of the related sales voucher.
Read-only.
voucherType
string	Voucher type of the related sales voucher.
All attributes listed above are read-only.

Files Details

The files object with its property documentFileId is deprecated and will be removed.
                    Property	Description
documentFileId
uuid	The id of the down payment invoice PDF. The PDF will be created when the invoice turns from draft into status open. To download the invoice PDF file please use the files endpoint.



Retrieve a Down Payment Invoice
Sample request

curl https://api.lexware.io/v1/down-payment-invoices/28af0062-5b19-11eb-9609-57d780e21aed
-X GET
-H "Authorization: Bearer {accessToken}"
-H "Content-Type: application/json"
-H "Accept: application/json"
Sample response

{
  "id": "0333f0c7-2b89-4889-b64e-68b3ca3f167a",
  "organizationId": "aa93e8a8-2aa3-470b-b914-caad8a255dd8",
  "createdDate": "2023-01-20T10:26:40.956+01:00",
  "updatedDate": "2023-01-21T13:34:13.228+01:00",
  "version": 3,
  "language": "de",
  "archived": false,
  "voucherStatus": "open",
  "voucherNumber": "RE1129",
  "voucherDate": "2023-01-20T10:26:26.565+01:00",
  "dueDate": "2023-02-19T00:00:00.000+01:00",
  "address": {
    "name": "Bike & Ride GmbH & Co. KG",
    "supplement": "Gebäude 10",
    "street": "Musterstraße 42",
    "city": "Freiburg",
    "zip": "79112",
    "countryCode": "DE"
  },
  "lineItems": [
    {
      "type": "custom",
      "name": "Pauschaler Abschlag",
      "quantity": 1,
      "unitPrice": {
        "currency": "EUR",
        "netAmount": 559.66,
        "grossAmount": 666,
        "taxRatePercentage": 19
      },
      "lineItemAmount": 666.00
    }
  ],
  "totalPrice": {
    "currency": "EUR",
    "totalNetAmount": 559.66,
    "totalGrossAmount": 666.00,
    "totalTaxAmount": 106.34
  },
  "taxAmounts": [
    {
      "taxRatePercentage": 19,
      "taxAmount": 106.34,
      "netAmount": 559.66
    }
  ],
  "taxConditions": {
    "taxType": "gross"
  },
  "paymentConditions": {
    "paymentTermLabel": "10 Tage - 3 %, 30 Tage netto",
    "paymentTermLabelTemplate": "{discountRange} Tage -{discount}, {paymentRange} Tage netto",
    "paymentTermDuration": 30,
    "paymentDiscountConditions": {
      "discountPercentage": 3,
      "discountRange": 10
    }
  },
  "shippingConditions": {
    "shippingType": "none"
  },
  "closingInvoiceId": "4ba90e2d-c206-4bb0-a135-3e714db617fb",
  "introduction": "Wie vereinbart, erlauben wir uns folgenden pauschalen Abschlag in Rechnung zu stellen.",
  "remark": "Vielen Dank für die gute Zusammenarbeit.",
  "files": {
    "documentFileId": "aa0388c5-20b5-49d7-96ce-0c08ac0482f4"
  },
  "title": "1. Abschlagsrechnung"
}
GET {resourceurl}/v1/down-payment-invoices/{id}

Returns the down payment invoice with id value {id}.

Download a Down Payment Invoice File
GET {resourceurl}/v1/down-payment-invoices/{id}/file

Sample request to download a down payment invoice file

curl "https://api.lexware.io/v1/down-payment-invoices/{id}/file"
-X GET
-H "Accept: */*"
-H "Authorization: Bearer {accessToken}"
Returns the file as binary data with HTTP response code 200. The HTTP header fields Content-Type specifies the file type (MIME type) and the Content-Length the size of the file in bytes. A suggested file name is returned in the header Content-Disposition.

For a down payment invoice, there can be multiple files associated with a single voucher document. Foremost, this includes e-invoices which provide a pdf and an xml representation. Use the Accept header as decribed below to choose between the downloaded formats.
For a down payment invoice both regular invoices as well as e-invoices are supported.

Regular invoices are only available in PDF format. E-invoices that include embedded XML data (e.g. ZUGFeRD invoices) can also only be downloaded as PDF files. E-invoices of the type XRechnung can be downloaded either in XML or in PDF format. Lexware generates the PDF of an XRechnung solely as a preview. It is not a valid e-invoice and should not be used as one. By sending different Accept headers, the client can choose which representation they want to retrieve.

Accept headers with wildcards are also supported and will return the default representation.

Here's a list of which file type (or which HTTP error) is returned for each voucher type and Accept header combination:

document profile	*/*	application/xml	application/pdf
XRechnung	.xml	.xml	.pdf
ZUGFeRD	.pdf	404	.pdf
regular PDF	.pdf	404	.pdf
If the down payment invoice itself does not exist, the request will be rejected with 404 Not Found.

Requests for other media types than application/pdf, application/xml and */* will generally be rejected with an HTTP status of 406 Not Acceptable.

For down payment invoices in draft mode, there does not exist a document file in Lexware. Any request attempts are rejected with 409 responses.
Deeplink to a Down Payment Invoice
Down payment invoices can be directly accessed by permanent HTTPS links to either be viewed or to be edited. If a down payment invoice is not allowed to be edited, a redirection to the view page takes place. In case the given id does not exist, a redirection to the main voucher list takes place.

View URL {appbaseurl}/permalink/invoices/view/{id}

Edit URL {appbaseurl}/permalink/invoices/edit/{id}

Event Subscriptions Endpoint
Purpose
Using event subscriptions you will be notified about certain events on resources - e.g. you receive a notification every time a contact changes in Lexware. This will make pull requests superfluous to keep your data synced between Lexware and your application. The notifications are implemented as webhooks. Subscribing to an event simply requires the event type and your callback url. With the event-subscriptions endpoint you can manage your subscriptions within Lexware.

For testing purposes, tools like the Webhook Tester - https://webhook.site can provide you with a sample callback url.
Please keep in mind that if a user invalidates their API Key, all subscriptions created with this key will be removed as well. Therefore, subscriptions should be recreated every time after a new API Key has been created.
Delivery Failure Behavior
A successful delivery of an event subscription request to your webhook url should return 200, 201, 202 or 204. In case of delivery failures, the following rules apply:

For HTTP status codes 401, 403, 429 and 5xx, a retry strategy is used (described below).
For HTTP status code 404 or incorrect DNS resolution, the event subscription will be deleted automatically after a retry strategy is used (described below).
Any redirection of status code 3xx will not be followed more than three times, nor will they be retried. In general, redirections should be avoided.
Client error responses of status code 4xx are generally not retried, except for the status codes listed above.
In case of HTTP status code 410, the event subscription will be removed immediately.
Retry strategy
If a request to your webhook url has failed, the following retry strategy is used:

Phase 1: 5 retries after 10, 20, 40, 80 and 160 seconds

Phase 2: after 30 minutes pause, 20 retries with 2 hours pause between

Our configured HTTP read timeout is set to 5000 ms, so we do not recommend to trigger long running processes / threads synchronously.

Event Subscriptions Properties
Sample of a created event subscription.

{
  "subscriptionId": "4d43ad14-671d-4e0c-fd4b-2fd8cc117eff",
  "organizationId": "aa93e8a8-2aa3-470b-b914-caad8a255dd8",
  "createdDate": "2023-04-11T12:15:00.000+02:00",
  "eventType": "contact.changed",
  "callbackUrl": "https://example.org/webhook"
}
                    Property	Description
subscriptionId
uuid	Unique id of the event subscription generated on creation by Lexware.
Read-only.
organizationId
uuid	Unique id of the organization the event subscription belongs to.
Read-only.
createdDate
dateTime	The instant of time when the event subscription was created by Lexware in format yyyy-MM-ddTHH:mm:ss.SSSXXX as described in RFC 3339/ISO 8601 (e.g. 2023-02-21T00:00:00.000+01:00).
Read-only.
eventType
string	The event type is a combined key which defines the resource and its event name you are subscribing to. All available events receivable via the API can be taken from the table Event Types.
callbackUrl
string	When a resource entity triggers an event, the callback url is used to notify the subscriber about it. The payload of the callback is described in Webhook Callback Properties.
Event Types
The following table lists all types of events you can subscribe to. The property EventType is the combined key of a resource and a event name. The EventType is handled in lower case.

Resource	Event type	Description
articles	article.created	A new article was created in Lexware.
articles	article.changed	A Lexware article has changed. You should get the updated article details.
articles	article.deleted	A Lexware article was deleted. Depending on your application, you should unlink the Lexware article on your side or delete it as well.
contacts	contact.created	A new contact was created in Lexware.
contacts	contact.changed	A Lexware contact has changed. You should get the updated contact details.
contacts	contact.deleted	A Lexware contact was deleted. Depending on your application, you should unlink the Lexware contact on your side or delete it as well.
credit-notes	credit-note.created	A new credit note was created in Lexware. Get the new credit note by calling the credit notes endpoint.
credit-notes	credit-note.changed	A credit note has changed. Get the updated credit note by calling the credit notes endpoint. Please note that the status may also have changed.
credit-notes	credit-note.deleted	A credit note was deleted in Lexware.
credit-notes	credit-note.status.changed	The status of a credit note has changed. Update the credit note by calling the credit notes endpoint to retrieve the new status.
delivery notes	delivery-note.created	A new delivery note was created in Lexware. Get the new delivery note by calling the delivery note endpoint.
delivery notes	delivery-note.changed	A delivery note has changed. Get the updated delivery note by calling the delivery note endpoint. Please note that the status may also have changed.
delivery notes	delivery-note.deleted	A delivery note was deleted in Lexware.
delivery-notes	delivery-note.status.changed	The status of a delivery note has changed. Update the delivery note by calling the delivery notes endpoint to retrieve the new status.
down-payment-invoices	down-payment-invoice.created	A new down payment invoice was created in Lexware. Get the new down payment invoice by calling the down payment invoices endpoint.
down-payment-invoices	down-payment-invoice.changed	A down payment invoice has changed. Get the updated down payment invoice by calling the down payment invoices endpoint. Please note that the status may also have changed.
down-payment-invoices	down-payment-invoice.deleted	A down payment invoice was deleted in Lexware.
down-payment-invoices	down-payment-invoice.status.changed	The status of a down payment invoice has changed. Update the down payment invoice by calling the down payment invoices endpoint to retrieve the new status.
dunnings	dunning.created	A new dunning was created in Lexware. Get the new dunning by calling the dunning endpoint.
dunnings	dunning.changed	A dunning has changed. Get the updated dunning by calling the dunning endpoint.
dunnings	dunning.deleted	A dunning was deleted in Lexware.
invoices	invoice.created	A new invoice was created in Lexware. Get the new invoice by calling the invoices endpoint.
invoices	invoice.changed	An invoice has changed. Get the updated invoice by calling the invoices endpoint. Please note that the status may also have changed.
invoices	invoice.deleted	An invoice was deleted in Lexware.
invoices	invoice.status.changed	The status of an invoice has changed. Update the invoice by calling the invoices endpoint to retrieve the new status.
order-confirmations	order-confirmation.created	A new order confirmation was created in Lexware. Get the new order confirmation by calling the order confirmations endpoint.
order-confirmations	order-confirmation.changed	An order confirmation has changed. Get the updated order confirmation by calling the order confirmations endpoint. Please note that the status may also have changed.
order-confirmations	order-confirmation.deleted	An order confirmation was deleted in Lexware.
order-confirmations	order-confirmation.status.changed	The status of an order confirmation has changed. Update the order confirmation by calling the order confirmations endpoint to retrieve the new status.
credit-notes, invoices, vouchers	payment.changed	The payment of a bookkeeping or sales voucher has changed due to a manual payment or a transaction assignment. Please use the payments endpoint or the respective resource endpoints to retrieve further information about the payment status of the resource. Please note that this event will also be triggered when changing the status of invoices and credit notes from open to draft. Requesting payments of draft vouchers using the payments endpoint will result in 406 HTTP status codes. This is not an error condition.
quotations	quotation.created	A new quotation was created in Lexware. Get the new quotation by calling the quotations endpoint.
quotations	quotation.changed	A quotation has changed. Get the updated quotation by calling the quotations endpoint. Please note that the status may also have changed.
quotations	quotation.deleted	A quotation was deleted in Lexware.
quotations	quotation.status.changed	The status of a quotation has changed. Update the quotation by calling the quotations endpoint to retrieve the new status.
recurring-templates	recurring-template.created	A new template for recurring invoices was created in Lexware. Get the new recurring template by calling the recurring templates endpoint.
recurring-templates	recurring-template.changed	A template for recurring invoices has changed. Get the updated recurring template by calling the recurring templates endpoint.
recurring-templates	recurring-template.deleted	A template for recurring invoices was deleted in Lexware.
revoke	token.revoked	The refresh token was revoked, hence is invalid. The resourceId in the webhook callback refers to the connectionId you retrieve using the profile endpoint. Please store the refresh token to the connectionId prior to the registration on this event.
vouchers	voucher.created	A new (bookkeeping) voucher was created in Lexware. Get the new voucher by calling the vouchers endpoint. Please note that uploading a new voucher document in Lexware will create a voucher.created event initially. Asynchronous post-processing may trigger additional voucher.changed events without external modification of the voucher by API clients or the user.
vouchers	voucher.changed	A voucher has changed. Get the updated voucher by calling the vouchers endpoint.
vouchers	voucher.deleted	A voucher was deleted in Lexware.
vouchers	voucher.status.changed	The status of a voucher has changed. Get the updated voucher by calling the vouchers endpoint.
Webhook Callback Properties
Sample payload from a webhook callback of an event subscription.

{
  "organizationId": "aa93e8a8-2aa3-470b-b914-caad8a255dd8",
  "eventType": "contact.changed",
  "resourceId": "4d43ad14-671d-4e0c-fd4b-2fd8cc117eff",
  "eventDate": "2023-04-11T12:30:00.000+02:00"
}
Subscribed events will send a POST request to your given webhook url and contain the following JSON payload.

                    Property	Description
organizationId
uuid	The organization for which an event has been triggered.
eventType
string	Describes the occurred event. The eventType describes the resource and the event name.
resourceId
uuid	The resource entity on which the event has occurred. Use the corresponding resource endpoint and the resourceId to get the latest data of the resource entity.
eventDate
dateTime	The instant of time when the event was triggered in format yyyy-MM-ddTHH:mm:ss.SSSXXX as described in RFC 3339/ISO 8601 (e.g. 2023-02-21T00:00:00.000+01:00).
Read-only.
Verify Authenticity
For verification that the webhook call was sent from Lexware, every webhook contains an RSA-SHA512 encrypted signature of the JSON request body (without whitespaces and linebreaks) in a base64 encoded header called X-Lxo-Signature. To verify it, please use this public key.

Example signature verification with OpenSSL
Sample Signature Verification with OpenSSL

openssl dgst -sha512 -verify public_key.pub -signature sample_signature_decoded sample_payload.json
The signature can be verified using openssl. With the public key, a sample payload and the decoded signature, openssl can be used to verify the signature. It should print Verified OK.

Sample decoding of base64 encoded signature

openssl base64 -d -in sample_signature_base64 -out  signature_decoded
The signature from the X-Lxo-Signature header is base64 encoded and needs to be decoded before calling the former command. For this example, this is the sample base64 encoded signature.

Create an Event Subscription
Sample request to create an event subscription

curl https://api.lexware.io/v1/event-subscriptions
-X POST
-H "Authorization: Bearer {accessToken}"
-H "Content-Type: application/json"
-H "Accept: application/json"
-d '
{
    "eventType": "contact.changed",
    "callbackUrl": "https://example.org/webhook"
}'
Sample response

{
    "id": "49aa2f76-c51a-4df3-ae83-3a103d781494",
    "resourceUri": "https://api.lexware.io/v1/event-subscriptions/49aa2f76-c51a-4df3-ae83-3a103d781494",
    "createdDate": "2023-04-11T12:20:00.000+02:00",
    "updatedDate": "2023-04-11T12:20:00.000+02:00",
    "version": 0
}
POST {resourceurl}/v1/event-subscriptions

To subscribe to an event, provide the event type and the webhook callback url in the request body. The endpoint returns an action result (HTTP status code 201 Created) on success. Additionally, the Location header returns the resource url.

If you already subscribed to the given event type with the given callback url you will receive the status code 409 (Conflict). To update a subscription you have to delete it first.
                    Property	Required	Notes
eventType	Yes	The name of the event usually a combined key containing the resource and the event name.
callbackUrl	Yes	Your webhook HTTPS url where you will be notified on events. A HEAD request will be sent to the given URL to determine if SSL certificates are correct. If this fails the endpoint returns a 406 HTTP status code.
Retrieve an Event Subscription
Sample request to retrieve all event subscriptions

curl https://api.lexware.io/v1/event-subscriptions/49aa2f76-c51a-4df3-ae83-3a103d781494
-X GET
-H "Authorization: Bearer {accessToken}"
-H "Accept: application/json"
Sample response

{
    "subscriptionId": "49aa2f76-c51a-4df3-ae83-3a103d781494",
    "organizationId": "aa93e8a8-2aa3-470b-b914-caad8a255dd8",
    "createdDate": "2023-04-11T12:20:00.000+02:00",
    "eventType": "contact.changed",
    "callbackUrl": "https://example.org/webhook"
}
GET {resourceurl}/v1/event-subscriptions/{subscriptionId}

Returns the event subscription with the id {subscriptionId}.

Retrieve all Event Subscriptions
Sample request to retrieve all event subscriptions

curl https://api.lexware.io/v1/event-subscriptions
-X GET
-H "Authorization: Bearer {accessToken}"
-H "Accept: application/json"
Sample response

{
    "content": [
        {
            "subscriptionId": "49aa2f76-c51a-4df3-ae83-3a103d781494",
            "organizationId": "aa93e8a8-2aa3-470b-b914-caad8a255dd8",
            "createdDate": "2023-04-11T12:20:00.000+02:00",
            "eventType": "contact.changed",
            "callbackUrl": "https://example.org/webhook"
        }
    ]
}
GET {resourceurl}/v1/event-subscriptions

Returns all your event subscriptions.

Delete an Event Subscription
Sample request to delete an event subscription

curl https://api.lexware.io/v1/event-subscriptions/49aa2f76-c51a-4df3-ae83-3a103d781494
-X DELETE
-H "Authorization: Bearer {accessToken}"
-H "Accept: application/json"
DELETE {resourceurl}/v1/event-subscriptions/{subscriptionId}

Deletes an event subscription with the id {subscriptionId}. On success, you will receive a status code 204 (No Content).

Files Endpoint
Purpose
Use this endpoint to upload and/or download files, e.g. vouchers or invoices.

 After vouchers are successfully uploaded, the files can be accessed in the unchecked folder ("Zu prüfen") in Lexware.
You can also see the number of uploaded vouchers on the Lexware dashboard: https://app.lexware.de/dashboard
The files endpoint uses the legacy error handling.
Upload a file
POST {resourceurl}/v1/files

Sample request file upload

curl https://api.lexware.io/v1/files
-X POST
-H "Authorization: Bearer {accessToken}"
-H "Content-Type: multipart/form-data"
-H "Accept: application/json"
-F "file=@{PathToFile}" -F "type=voucher"
Uploading files to Lexware are HTTP multipart requests where the Content-Type header must be set to multipart/form-data and the file contents have to be sent as binary data. Moreover, it is required to specify the upload type which must be included to the form data with name = type and e.g. value = voucher.

Available upload types and its valid file formats are:

upload type	file formats	max file size	Description
voucher	pdf, jpg, png, xml	5 MB	Upload voucher images for bookkeeping purposes.
Handling of maximum supported file size - e.g. 5 MB for vouchers. If the calling system can handle larger files (e.g. images), the following actions are recommended: Check if file size is larger than allowed, and if, reduce size and/or quality until size fits the requirements. Then submit this (temporary) resized/rescaled image again to Lexware.
If this is not suitable/applicable, then check if file size is larger than allowed and show a message to the user that this file cannot be submitted when the file size exceeds the limit.
To be able to upload XML files such as e-invoices, the respective feature "E-Rechnung" needs to be activated under the settings E-Rechnung in the web interface. Otherwise, the request will be rejected with status code 406 and i18nKey inacceptable_file_extension.
Sample Response

{
  "id": "8118c402-1c70-4da1-a9f1-a22f480cc623",
  "voucherId": "1deeb1c1-47d6-43f9-9512-c18dd37826fe"
}
A successful upload returns a HTTP status 202 Accepted along with the file id and the id of the associated voucher.

Please be aware that the voucher is immediately available via vouchers/{id} after a file upload. Initially, the voucher will be in the status `blank`, indicating that it has been created but is still awaiting the completion of the asynchronous text recognition (OCR) process. Once the OCR process is complete, the status will change to `unchecked`. At this point, the `voucher.created` event will be triggered, marking the completion of the voucher capture process.
Upload requests containing invalid file contents or causing errors during image processing are responded with HTTP status 406 Not Acceptable. The returned response body should give reasons about the rejection.

If the upload type is not provided or is not valid, a HTTP status 400 Bad Request will be returned. If no file is provided, the file upload endpoint returns HTTP status 500.

For each uploaded file of type voucher we calculate a checksum from the file content. If there already exists the same file (due to the checksum), then the file id of the existing file and the associated voucher id is returned and the upload file will be discarded.
If a file upload is directly associated with a voucher, please use the vouchers/{id}/files endpoint instead.
Download a file
This endpoint is deprecated for sales voucher documents and should only be used to download bookkeeping voucher documents. To download sales vouchers, use the appropriate sales voucher file subresource (e.g. the invoice file endpoint).
GET {resourceurl}/v1/files/{id}

Sample request file download

curl "https://api.lexware.io/v1/files/{id}"
-X GET
-H "Accept: */*"
-H "Authorization: Bearer {accessToken}"
Returns the file as binary data with id value {id}. The HTTP header fields Content-Type specifies the file type (MIME type) and the Content-Length the size of the file in bytes. A suggested file name is returned in the header Content-Disposition.

For some voucher types, there are multiple files associated with a single voucher document. Foremost, this includes e-invoices which provide a pdf and an xml representation. Use the Accept header as decribed below to choose between the downloaded formats.
e-invoices and the Accept header

The files endpoint provides an abstract method to download various types of files associated with both sales and bookkeeping vouchers. Historically, the Accept header was ignored, and the file was returned, regardless of its actual and the requested media types.

By sending different Accept headers, the client can choose between multiple representation files of a voucher, especially for e-invoices. So with the e-invoice support in Lexware, the files endpoint may return different files for different Accept headers.

In general, we differentiate between bookkeeping vouchers (Eingangsbelege) and sales vouchers (Ausgangsbelege). For sales vouchers downloads, please use the appropriate sales voucher file subresource (e.g. the invoice file endpoint). For e-invoices related to bookkeeping vouchers, where a separate XML file exists, both the XML file and the PDF can be retrieved using different Accept headers. In cases where the XML is embedded in the PDF (e.g., ZUGFeRD invoices), only the PDF file is available for download. For all other regular vouchers in PDF, PNG, or JPG formats, the */*, application/pdf, image/png, or image/jpeg headers can be used.

Accept headers with wildcards are also supported and will return the default representation.

Here's a list of which file type (or which HTTP error) is returned for each voucher type and Accept header combination:

bookkeeping vouchers:

original file type of voucher	*/*	application/xml	application/pdf	image/jpeg	image/png
XML	.xml	.xml	.pdf	.pdf	.pdf
regular PDF	.pdf	404	.pdf	.pdf	.pdf
PDF with embedded XML file	.pdf	404	.pdf	.pdf	.pdf
PNG	.png	404	.png	.png	.png
JPG	.jpg	404	.jpg	.jpg	.jpg
sales vouchers:

original file type of voucher	*/*	application/xml	application/pdf	image/jpeg	image/png
X-Rechnung	.pdf	.xml	.pdf	.pdf	.pdf
regular PDF	.pdf	404	.pdf	.pdf	.pdf
Requests for other media types will be rejected with an HTTP status of 406 Not Acceptable.

Simply put: Send Accept: */* for all regular purposes; use Accept: application/xml to retrieve the e-invoice XML file (unless the XML file is embedded in the PDF file).

Deeplink to uploaded files
Newly uploaded files for bookkeeping in Lexware can be accessed via the following deeplink for further processing by the user, e.g. adjusting or completing the voucher details. However, files which are directly uploaded to a voucher with status other than unchecked or linked to a resource in a subsequent api call (Vouchers Endpoint) will not appear.

View URL {appbaseurl}/permalink/files/view

Invoices Endpoint
Purpose
This endpoint provides read and write access to invoices. Invoices can be created in draft or open (finalized) states. During finalization, the corresponding file documents are created automatically depending on the data. Usually there is always a PDF representation. In the case of an XRechung, however, the standard format is an XML file.

A higher level description of the handling of invoices via the Lexware API can be found in the invoice cookbook (German only).

It is possible to create invoices with value-added tax such as of type net (Netto), gross (Brutto) or different types of vat-free. For tax-exempt organizations vat-free (Steuerfrei) invoices can be created exclusively. All other vat-free tax types are only usable in combination with a referenced contact in Lexware. For recipients within the EU these are intra-community supply (Innergemeinschaftliche Lieferung gem. §13b UStG), constructional services (Bauleistungen gem. §13b UStG) and external services (Fremdleistungen innerhalb der EU gem. §13b UStG). For invoices to third countries, the tax types third party country service (Dienstleistungen an Drittländer) and third party country delivery (Ausfuhrlieferungen an Drittländer) are possible.

Read-only support for invoices for down payment (Abschlagsrechnung) is provided by the Down Payment Invoice Endpoint.

Invoices Properties
Sample of an invoice with multiple line items. Fields with no content are displayed with "null" just for demonstration purposes.

{
   "id":"e9066f04-8cc7-4616-93f8-ac9ecc8479c8",
   "organizationId":"aa93e8a8-2aa3-470b-b914-caad8a255dd8",
   "createdDate":"2023-04-24T08:20:22.528+02:00",
   "updatedDate":"2023-04-24T08:20:22.528+02:00",
   "version":0,
   "language":"de",
   "archived":false,
   "voucherStatus":"draft",
   "voucherNumber":"RE1019",
   "voucherDate":"2023-02-22T00:00:00.000+01:00",
   "dueDate":null,
   "address":{
      "contactId":null,
      "name":"Bike & Ride GmbH & Co. KG",
      "supplement":"Gebäude 10",
      "street":"Musterstraße 42",
      "city":"Freiburg",
      "zip":"79112",
      "countryCode":"DE"
   },
   "xRechnung":null,
   "electronicDocumentProfile":"NONE",
   "lineItems":[
      {
         "id":"97b98491-e953-4dc9-97a9-ae437a8052b4",
         "type":"material",
         "name":"Abus Kabelschloss Primo 590 ",
         "description":"· 9,5 mm starkes, smoke-mattes Spiralkabel mit integrierter Halterlösung zur Befestigung am Sattelklemmbolzen · bewährter Qualitäts-Schließzylinder mit praktischem Wendeschlüssel · KabelØ: 9,5 mm, Länge: 150 cm",
         "quantity":2,
         "unitName":"Stück",
         "unitPrice":{
            "currency":"EUR",
            "netAmount":13.4,
            "grossAmount":15.95,
            "taxRatePercentage":19
         },
         "discountPercentage":50,
         "lineItemAmount":13.4
      },
      {
         "id":"dc4c805b-7df1-4310-a548-22be4499eb04",
         "type":"service",
         "name":"Aufwändige Montage",
         "description":"Aufwand für arbeitsintensive Montagetätigkeit",
         "quantity":1,
         "unitName":"Stunde",
         "unitPrice":{
            "currency":"EUR",
            "netAmount":8.32,
            "grossAmount":8.9,
            "taxRatePercentage":7
         },
         "discountPercentage":0,
         "lineItemAmount":8.32
      },
      {
         "id":null,
         "type":"custom",
         "name":"Energieriegel Testpaket",
         "description":null,
         "quantity":1,
         "unitName":"Stück",
         "unitPrice":{
            "currency":"EUR",
            "netAmount":5,
            "grossAmount":5,
            "taxRatePercentage":0
         },
         "discountPercentage":0,
         "lineItemAmount":5
      },
      {
         "type":"text",
         "name":"Freitextposition",
         "description":"This item type can contain either a name or a description or both."
      }
   ],
   "totalPrice":{
      "currency":"EUR",
      "totalNetAmount":26.72,
      "totalGrossAmount":29.85,
      "totalTaxAmount":3.13,
      "totalDiscountAbsolute":null,
      "totalDiscountPercentage":null
   },
   "taxAmounts":[
      {
         "taxRatePercentage":0,
         "taxAmount":0,
         "netAmount":5
      },
      {
         "taxRatePercentage":7,
         "taxAmount":0.58,
         "netAmount":8.32
      },
      {
         "taxRatePercentage":19,
         "taxAmount":2.55,
         "netAmount":13.4
      }
   ],
   "taxConditions":{
      "taxType":"net",
      "taxTypeNote":null
   },
   "paymentConditions":{
      "paymentTermLabel":"10 Tage - 3 %, 30 Tage netto",
      "paymentTermLabelTemplate":"{discountRange} Tage -{discount}, {paymentRange} Tage netto",
      "paymentTermDuration":30,
      "paymentDiscountConditions":{
         "discountPercentage":3,
         "discountRange":10
      }
   },
   "shippingConditions":{
      "shippingDate":"2023-04-22T00:00:00.000+02:00",
      "shippingEndDate":null,
      "shippingType":"delivery"
   },
   "closingInvoice":false,
   "claimedGrossAmount":null,
   "downPaymentDeductions":null,
   "recurringTemplateId":null,
   "relatedVouchers":[],
   "printLayoutId": "28c212c4-b6dd-11ee-b80a-dbc65f4ceccf",
   "title":"Rechnung",
   "introduction":"Ihre bestellten Positionen stellen wir Ihnen hiermit in Rechnung",
   "remark":"Vielen Dank für Ihren Einkauf",
   "files":{
      "documentFileId":"75295db7-7e69-4630-befd-a7f4ddfdaa83"
   }
}
                    Property	Description
id
uuid	Unique id generated on creation by Lexware.
Read-only.
organizationId
uuid	Unique id of the organization the invoice belongs to.
Read-only.
createdDate
dateTime	The instant of time when the invoice was created by Lexware in format yyyy-MM-ddTHH:mm:ss.SSSXXX as described in RFC 3339/ISO 8601 (e.g. 2023-02-21T00:00:00.000+01:00).
Read-only.
updatedDate
dateTime	The instant of time when the invoice was updated by Lexware in format yyyy-MM-ddTHH:mm:ss.SSSXXX as described in RFC 3339/ISO 8601 (e.g. 2023-02-21T00:00:00.000+01:00).
Read-only.
version
integer	Version (revision) number which will be increased on each change to handle optimistic locking.
Read-only.
language
string	Specifies the language of the invoice which affects the print document but also set translated default text modules when no values are send (e.g. for introduction). Values accepted in ISO 639-1 code. Possible values are German de (default) and English en.
archived
boolean	Specifies if the invoice is only available in the archive in Lexware.
Read-only.
voucherStatus
enum	Specifies the status of the invoice. Possible values are draft (is editable), open (finalized and no longer editable but yet unpaid or only partially paid), paid (has been fully paid), voided (cancelled)
Read-only.
voucherNumber
string	The specific number an invoice is aware of. This consecutive number is set by Lexware on creation.
Read-only.
voucherDate
dateTime	The date of the invoice in format yyyy-MM-ddTHH:mm:ss.SSSXXX as described in RFC 3339/ISO 8601 (e.g. 2023-02-21T00:00:00.000+01:00).
dueDate
dateTime	Sets the date on which the invoice is payable before becoming overdue in format yyyy-MM-ddTHH:mm:ss.SSSXXX as described in RFC 3339/ISO 8601 (e.g. 2023-02-21T00:00:00.000+01:00).
Read-only.
address
object	The address of the invoice recipient. For details see below.
xRechnung
object	XRechnung related properties for XRechnung enabled invoices. For details see below
electronicDocumentProfile
enum	The electronic document profile of the invoice. Possible values are NONE (no electronic document profile, also returned for non-invoice sales vouchers and draft invoices), EN16931 (ZUGFeRD), and XRechnung (XRechnung enabled invoice).
Read-only.
lineItems
list	The items of the invoice. For details see below.
totalPrice
object	The total price of the invoice. For details see below.
taxAmounts
list	The tax amounts for each tax rate. Please note: As done with every read-only element or object all submitted content (POST) will be ignored. For details see below.
Read-only.
taxConditions
object	The tax conditions of the invoice. For details see below.
paymentConditions
object	The payment conditions of the invoice. The organization's (or contact-specific) default is used if no value was sent. For details see below.
shippingConditions
object	The shipping conditions of the invoice. For details see below.
closingInvoice
boolean	Denotes whether this invoice is a closing invoice (Schlussrechnung)
Read-only.
claimedGrossAmount
number	The remaining gross amount (see description below)
Read-only.
downPaymentDeductions
list	The down payments connected to this closing invoice.
Read-only.
recurringTemplateId
UUID	The id of the recurring template, if this is a recurring invoice deduced from a template. Null otherwise.
relatedVouchers
list	The related vouchers of the invoice. Read-only.
printLayoutId
uuid	(Optional) The id of the print layout to be used for the invoice. The organization's default print layout will be used if no value is sent.
title
string	(Optional) A title text. The organization's default is used if no value was sent.
introduction
string	(Optional) An introductory text / header. The organization's default is used if no value was sent.
remark
string	(Optional) A closing text note. The organization's default is used if no value was sent.
files
object	(Deprecated, will be removed) The document id for the PDF version of the invoice. For details see below.
Read-only.
Address Details

There are two main options to address the recipient of an invoice. First, using an existing Lexware contact or second, creating a new address.

For referencing an existing contact it is only necessary to provide the UUID of that contact. Usually the billing address is used (for delivery notes, the shipping address will be preferred). Additionally, the referenced address can also be modified for this specific invoice. This can be done by setting all required address fields and this deviated address will not be stored back to the Lexware contacts.

The referenced contact needs to have the role customer. For more information please refer to the contacts endpoint.
Otherwise, a new address for the invoice recipient can be created. That type of address is called a "one-time address". A one-time address will not create a new contact in Lexware. For instance, this could be useful when it is not needed to create a contact in Lexware for each new invoice.

Please get in touch with us if you are not sure which option fits your use case best.

                    Property	Description
contactId
uuid	If the invoice recipient is (optionally) registered as a contact in Lexware, this field specifies the related id of the contact.
name
string	The name of the invoice recipient. To use an existing contact of an individual person, provide the name in the format {firstname} {lastname}.
supplement
string	(Optional) An address supplement.
street
string	The street (street and street number) of the address.
city
string	The city of the address.
zip
string	The zip code of the address.
countryCode
enum	The ISO 3166 alpha2 country code of the address.
contactPerson
string	The contact person selected while editing the voucher. The primary contact person will be used when creating vouchers via the API with a referenced contactId.
Read-only.
Line Items Details

A maximum of 300 line items can be used in a single invoice.
For referencing an existing product or service, it is necessary to provide its UUID. However, all required properties must still be specified for the referencing line item. Additionally, the referenced product or service can be modified by adjusting the input. This deviated data will not be stored back to the product/service in Lexware.

                    Property	Description
id
uuid	The field specifies the related id of a referenced product/service.
type
enum	The type of the item. Possible values are service (the line item is related to a supply of services), material (the line item is related to a physical product), custom (an item without reference in Lexware and has no id) or text (contains only a name and/or a description for informative purposes).
name
string	The name of the item.
description
string	The description of the item.
quantity
number	The amount of the purchased item. The value can contain up to 4 decimals.
unitName
string	The unit name of the purchased item. If the provided unit name is not known in Lexware it will be created on the fly.
unitPrice
object	The unit price of the purchased item. For details see below.
discountPercentage
number	The offered discount for the item. The value can contain up to 2 decimals.
lineItemAmount
number	The total price of this line item. Depending by the selected taxType in taxConditions, the amount must be given either as net or gross. The value can contain up to 2 decimals.
Read-only.
Unit Price Details

                    Property	Description
currency
enum	The currency of the price. Currently only EUR is supported.
netAmount
number	The net price of the unit price. The value can contain up to 4 decimals.
grossAmount
number	The gross price of the unit price. The value can contain up to 4 decimals.
taxRatePercentage
number	The tax rate of the unit price. See the "Supported tax rates" FAQ for more information and a list of possible values.. For vat-free sales vouchers the tax rate percentage must be 0.
Total Price Details

                    Property	Description
currency
string	The currency of the total price. Currently only EUR is supported.
totalNetAmount
number	The total net price over all line items. The value can contain up to 2 decimals.
Read-only.
totalGrossAmount
number	The total gross price over all line items. The value can contain up to 2 decimals.
Read-only.
totalTaxAmount
number	The total tax amount over all line items. The value can contain up to 2 decimals.
Read-only.
totalDiscountAbsolute
number	(Optional) A total discount as absolute value. The value can contain up to 2 decimals.
totalDiscountPercentage
number	(Optional) A total discount relative to the gross amount or net amount dependent on the given tax conditions. A contact-specific default will be set if available and no total discount was send. The value can contain up to 2 decimals.
Tax Amounts Details

                    Property	Description
taxRatePercentage
number	Tax rate as percentage value. See the "Supported tax rates" FAQ for more information and a list of possible values..
taxAmount
number	The total tax amount for this tax rate. The value can contain up to 2 decimals.
netAmount
number	The total net amount for this tax rate. The value can contain up to 2 decimals.
Tax Conditions Details

Sample for vat-free tax conditions

"taxConditions": {
    "taxType": "constructionService13b",
    "taxTypeNote": "Steuerschuldnerschaft des Leistungsempfängers (Reverse Charge)"
}
                    Property	Description
taxType
enum	The tax type for the invoice. Possible values are net, gross, vatfree (Steuerfrei), intraCommunitySupply (Innergemeinschaftliche Lieferung gem. §13b UStG), constructionService13b (Bauleistungen gem. §13b UStG), externalService13b (Fremdleistungen innerhalb der EU gem. §13b UStG), thirdPartyCountryService (Dienstleistungen an Drittländer), thirdPartyCountryDelivery (Ausfuhrlieferungen an Drittländer), and photovoltaicEquipment (0% taxation for photovoltaic equipment and installations in Germany starting 2023-01, Material und Leistungen für Photovoltaik-Installationen)
taxSubType
enum	A tax subtype. Only required for dedicated cases. For vouchers referencing a B2C customer in the EU, and with a taxType of net or gross, the taxSubType may be set to distanceSales, or electronicServices. Passing a null value results in a standard voucher.
If the organization's distanceSalesPrinciple (profile endpoint) is set to DESTINATION and this attribute is set to distanceSales or electronicServices, the voucher needs to reference the destination country's tax rates.
taxTypeNote
string	When taxType is set to a vat-free tax type then a note regarding the conditions can be set. When omitted Lexware sets the organization's default.
Payment Conditions Details

The payment conditions are optional and the organization's or contact-specific defaults will be used if ommitted.

                    Property	Description
paymentTermLabel
string	A textual note regarding the payment conditions.
paymentTermLabelTemplate
string	A textual note regarding the payment conditions. This label template may contain variables such as the discount range. These variables are enclosed in curly braces, e.g., {discountRange}.'
Read-only.
paymentTermDuration
integer	The time left (in days) until the payment must be conducted.
paymentDiscountConditions
object	The payment discount conditions for the invoice.
Payment Discount Conditions Details

                    Property	Description
discountPercentage
number	The discount offered in return for payment within the discountRange. The value can contain up to 2 decimals.
discountRange
integer	The time left (in days) the discount is valid.
Shipping Conditions Details

                    Property	Description
shippingDate
dateTime	The instant of time when the purchased items have to be shipped. Value in format yyyy-MM-ddTHH:mm:ss.SSSXXX as described in RFC 3339/ISO 8601 (e.g. 2023-02-21T00:00:00.000+01:00).
shippingEndDate
dateTime	An end instant in order to specify a shipping period of time. Value in format yyyy-MM-ddTHH:mm:ss.SSSXXX as described in RFC 3339/ISO 8601 (e.g. 2023-02-21T00:00:00.000+01:00). Must not specify an instant before shippingDate.
shippingType
enum	The type of the shipping. Possible values are service (a service is supplied on shippingDate), serviceperiod (a service is supplied within the period [shippingDate,shippingEndDate] ), delivery (a product is delivered), deliveryperiod (a product is delivered within the period [shippingDate,shippingEndDate]) and none (no shipping date has to be provided)
Related Vouchers Details

The relatedVouchers property documents all existing voucher relations for the current sales voucher. If no related vouchers exist, an empty list will be returned.

                    Property	Description
id
uuid	The related sales voucher's unique id.
voucherNumber
string	The specific number of the related sales voucher.
Read-only.
voucherType
string	Voucher type of the related sales voucher.
All attributes listed above are read-only.

Down Payment Deductions Details

Use the Down Payment Invoices endpoint to retrieve details of a down payment invoice.

 Property	Description
id
uuid	The down payment deduction's unique id.
voucherType
string	Voucher type of the down payment. Currently, always contains the string downpaymentinvoice.
title
string	Down payment's title
voucherNumber
string	Down payment's voucher number
voucherDate
dateTime	Down payment's date in format yyyy-MM-ddTHH:mm:ss.SSSXXX as described in RFC 3339/ISO 8601 (e.g. 2023-02-21T00:00:00.000+01:00).
receivedGrossAmount
number	The gross amount received for this down payment invoice
receivedNetAmount
number	The net amount received for this down payment invoice
receivedTaxAmount
number	Tax received for this down payment invoice
taxRatePercentage
number	The tax rate used for amount calculation in this down payment invoice
As closing invoices are currently read-only, all of the attributes listed above are read-only.

Files Details

The files object with its property documentFileId is deprecated and will be removed.
                    Property	Description
documentFileId
uuid	The id of the invoice PDF. The PDF will be created when the invoice turns from draft into status open. To download the invoice PDF file please use the files endpoint.



XRechnung Details

XRechnung properties are only relevant if an XRechnung enabled contact is referenced. In this case, if xRechnung is ommitted, the contact's buyer reference is used by default. If xRechnung is present, buyerReference is a mandatory field.

The buyerReference (Leitweg-ID) stored in the referenced contact can be overwritten for a specific invoice by transmitting a different buyerReference during invoice creation. If a buyer reference is specified, but the linked contact has no buyer reference and vendor number at the customer, request attempts are rejected with 406.

It is also possible to create a standard invoice for an XRechnung enabled contact. To do so, please set the buyerReference to an empty string.

                    Property	Description
buyerReference
string	The customer's Leitweg-ID for XRechnung enabled invoices
Closing Invoices
Lexware provides closing invoices (Schlussrechnungen), representing the last invoice for a project, and referencing a number of down payments (Abschlagsrechnungen). Closing invoices have a number of unique properties:

The closingInvoice attribute is true
They provide a claimedGrossAmount attribute, reflecting the amount yet to be claimed (i.e., the total gross amount minus the sum of the received gross amounts in all related down payments)
They contain a list of down payment objects
At the moment, the API only provides read only access to closing invoices; the three attributes are read-only.

Create an Invoice
Sample request to create an invoice

curl https://api.lexware.io/v1/invoices
-X POST
-H "Authorization: Bearer {accessToken}"
-H "Content-Type: application/json"
-H "Accept: application/json"
-d '
{
 "archived": false,
  "voucherDate": "2023-02-22T00:00:00.000+01:00",
   "address": {
   "name": "Bike & Ride GmbH & Co. KG",
    "supplement": "Gebäude 10",
    "street": "Musterstraße 42",
    "city": "Freiburg",
    "zip": "79112",
    "countryCode": "DE"
  },
  "lineItems": [
    {
      "type": "custom",
      "name": "Energieriegel Testpaket",
      "quantity": 1,
      "unitName": "Stück",
      "unitPrice": {
        "currency": "EUR",
        "netAmount": 5,
        "taxRatePercentage": 0
      },
      "discountPercentage": 0
    },
    {
      "type": "text",
      "name": "Strukturieren Sie Ihre Belege durch Text-Elemente.",
      "description": "Das hilft beim Verständnis"
    }
  ],
  "totalPrice": {
    "currency": "EUR"
   },
  "taxConditions": {
    "taxType": "net"
  },
  "paymentConditions": {
    "paymentTermLabel": "10 Tage - 3 %, 30 Tage netto",
    "paymentTermDuration": 30,
    "paymentDiscountConditions": {
      "discountPercentage": 3,
      "discountRange": 10
    }
  },
  "shippingConditions": {
    "shippingDate": "2023-04-22T00:00:00.000+02:00",
    "shippingType": "delivery"
  },
  "title": "Rechnung",
  "introduction": "Ihre bestellten Positionen stellen wir Ihnen hiermit in Rechnung",
  "remark": "Vielen Dank für Ihren Einkauf"
}
'
Sample response

{
  "id": "e9066f04-8cc7-4616-93f8-ac9ecc8479c8",
  "resourceUri": "https://api.lexware.io/v1/invoices/66196c43-bfee-baf3-4335-d610367059db",
  "createdDate": "2023-06-29T15:15:09.447+02:00",
  "updatedDate": "2023-06-29T15:15:09.447+02:00",
  "version": 1
}
POST {resourceurl}/v1/invoices[?finalize=true]

Invoices transmitted via the API are created in draft mode per default. To create a finalized invoice with status open the optional query parameter finalize has to be set. The status of an invoice cannot be changed via the api.

The created invoice will be shown in the main voucher list in Lexware: https://app.lexware.de/vouchers. To provide your end-users access to the created invoice please use our deeplink function.

It is possible to create invoices in the XRechnung data format by referencing a contact which is entitled to receive an XRechnung. Please note that an extended validation conforming to the XRechnung specification will be performed when creating such an invoice. More information can be found in the XRechnung FAQ.

The contents of the invoice are expected in the request's body as an application/json and must not contain read-only fields. See our FAQ on further information on text fields.

Description of required properties when creating an invoice.

                    Property	Required	Notes
voucherDate	Yes	
address	Yes	Nested object. Required fields for address please see below.
xRechnung	*	Nested object. The given buyer reference id of the xRechnung object overwrites the buyer reference specified in the linked contact, only for this invoice. Details of nested object please see below.
lineItems	Yes	List of nested objects. Required fields for lineItems please see below.
totalPrice	Yes	Nested object. Required fields for totalPrice please see below.
taxConditions	Yes	Nested object. Required fields for taxConditions see below.
shippingConditions	Yes	Nested object. Required fields for shippingConditions please see below.
XRechnung Required Properties

Description of required xRechnung properties when creating an invoice.

XRechnung properties are only relevant if an XRechnung enabled contact is referenced. In this case, if xRechnung is ommitted, the contact's buyer reference is used by default. If xRechnung is present, buyerReference is a mandatory field.

The buyerReference (Leitweg-ID) stored in the referenced contact can be overwritten for a specific invoice by transmitting a different buyerReference during invoice creation. If a buyer reference is specified, but the linked contact has no buyer reference and vendor number at the customer, request attempts are rejected with 406.

It is also possible to create a standard invoice for an XRechnung enabled contact. To do so, please set the buyerReference to an empty string.

                    Property	Required	Notes
buyerReference	*	Only when overwriting the buyer reference for the referenced contact only for this invoice or to create a standard invoice by setting it to an empty string.
Address Required Properties

Description of required address properties when creating an invoice.

                    Property	Required	Notes
contactId	*	Only when referencing an existing Lexware contact.
name	*	Only required when no existing contact is referenced.
countryCode	*	Only required when no existing contact is referenced.
Line Items Required Properties

Description of required lineItem properties when creating an invoice.

                    Property	Required	Notes
id	*	Required for type service and material.
type	Yes	Supported values are custom, material, service and text.
name	Yes	
quantity	*	Required for type custom, service and material.
unitName	*	Required for type custom, service and material.
unitPrice	*	Required for type custom, service and material. Nested object. Required fields for unitPrice see below.
Unit Price Required Properties

Description of required unitPrice properties when creating an invoice.

                    Property	Required	Notes
currency	Yes	
netAmount	*	Only relevant if taxConditions.taxType != gross is delivered.
grossAmount	*	Only relevant if taxConditions.taxType == gross is delivered.
taxRatePercentage	Yes	Must be 0 for vat-free sales voucher.
Total Price Required Properties

Description of required totalPrice properties when creating an invoice.

                    Property	Required	Notes
currency	Yes	
Tax Condition Required Properties

Description of required tax condition properties when creating an invoice.

                    Property	Required	Notes
taxType	Yes	Supported values are: gross, net, vatfree, intraCommunitySupply, constructionService13b, externalService13b, thirdPartyCountryService, thirdPartyCountryDelivery.
Shipping Condition Required Properties

Description of required shipping condition properties when creating an invoice.

                    Property	Required	Notes
shippingType	Yes	
shippingDate	*	Required for shipping types service, serviceperiod, delivery and deliveryperiod.
shippingEndDate	*	Required for shipping types serviceperiod and deliveryperiod.
Pursue to an Invoice
POST {resourceurl}/v1/invoices?precedingSalesVoucherId={id}[&finalize=true]

To be able to pursue a sales voucher to an invoice, the optional query parameter precedingSalesVoucherId needs to be set. The id value {id} refers to the preceding sales voucher which is going to be pursued.

To get an overview of the valid and possible pursue actions in Lexware, please see the linked sales voucher document chain. The recommended process is highlighted in blue. If the pursue action is not valid, the request will be rejected with 406 response.

If a quotation is referenced by the precedingSalesVoucherId which contains any alternative or optional line items, the request will be rejected with 406 response.
Also, if an order confirmation or a delivery note with the status draft is referenced by the precedingSalesVoucherId, the request will be rejected with 406 response.
 Please note that the pursuing of a sales voucher to a closing invoice via API is not possible because the API provides read only access for closing invoices.
Retrieve an Invoice
Sample request

curl https://api.lexware.io/v1/invoices/e9066f04-8cc7-4616-93f8-ac9ecc8479c8
-X GET
-H "Authorization: Bearer {accessToken}"
-H "Content-Type: application/json"
-H "Accept: application/json"
Sample response


{
  "id": "e9066f04-8cc7-4616-93f8-ac9ecc8479c8",
  "organizationId": "aa93e8a8-2aa3-470b-b914-caad8a255dd8",
  "createdDate": "2023-04-24T08:20:22.528+02:00",
  "updatedDate": "2023-04-24T08:20:22.528+02:00",
  "version": 0,
  "language": "de",
  "archived": false,
  "voucherStatus": "draft",
  "voucherNumber": "RE1019",
  "voucherDate": "2023-02-22T00:00:00.000+01:00",
  "address": {
    "name": "Bike & Ride GmbH & Co. KG",
    "supplement": "Gebäude 10",
    "street": "Musterstraße 42",
    "city": "Freiburg",
    "zip": "79112",
    "countryCode": "DE"
  },
  "lineItems": [
    {
      "id": "97b98491-e953-4dc9-97a9-ae437a8052b4",
      "type": "material",
      "name": "Abus Kabelschloss Primo 590 ",
      "description": "· 9,5 mm starkes, smoke-mattes Spiralkabel mit integrierter Halterlösung zur Befestigung am Sattelklemmbolzen · bewährter Qualitäts-Schließzylinder mit praktischem Wendeschlüssel · KabelØ: 9,5 mm, Länge: 150 cm",
      "quantity": 2,
      "unitName": "Stück",
      "unitPrice": {
        "currency": "EUR",
        "netAmount": 13.4,
        "grossAmount": 15.95,
        "taxRatePercentage": 19
      },
      "discountPercentage": 50,
      "lineItemAmount": 13.4
    },
    {
      "id": "dc4c805b-7df1-4310-a548-22be4499eb04",
      "type": "service",
      "name": "Aufwändige Montage",
      "description": "Aufwand für arbeitsintensive Montagetätigkeit",
      "quantity": 1,
      "unitName": "Stunde",
      "unitPrice": {
        "currency": "EUR",
        "netAmount": 8.32,
        "grossAmount": 8.9,
        "taxRatePercentage": 7
      },
      "discountPercentage": 0,
      "lineItemAmount": 8.32
    },
    {
      "type": "custom",
      "name": "Energieriegel Testpaket",
      "quantity": 1,
      "unitName": "Stück",
      "unitPrice": {
        "currency": "EUR",
        "netAmount": 5,
        "grossAmount": 5,
        "taxRatePercentage": 0
      },
      "discountPercentage": 0,
      "lineItemAmount": 5
    }
  ],
  "totalPrice": {
    "currency": "EUR",
    "totalNetAmount": 26.72,
    "totalGrossAmount": 29.85,
    "totalTaxAmount": 3.13
  },
  "taxAmounts": [
    {
      "taxRatePercentage": 0,
      "taxAmount": 0,
      "netAmount": 5
    },
    {
      "taxRatePercentage": 7,
      "taxAmount": 0.58,
      "netAmount": 8.32
    },
    {
      "taxRatePercentage": 19,
      "taxAmount": 2.55,
      "netAmount": 13.4
    }
  ],
  "taxConditions": {
    "taxType": "net"
  },
  "paymentConditions": {
    "paymentTermLabel": "10 Tage - 3 %, 30 Tage netto",
    "paymentTermLabelTemplate": "{discountRange} Tage -{discount}, {paymentRange} Tage netto",
    "paymentTermDuration": 30,
    "paymentDiscountConditions": {
      "discountPercentage": 3,
      "discountRange": 10
    }
  },
  "shippingConditions": {
    "shippingDate": "2023-04-22T00:00:00.000+02:00",
    "shippingType": "delivery"
  },
  "title": "Rechnung",
  "introduction": "Ihre bestellten Positionen stellen wir Ihnen hiermit in Rechnung",
  "remark": "Vielen Dank für Ihren Einkauf"
}
GET {resourceurl}/v1/invoices/{id}

Returns the invoice with id value {id}.

Render an Invoice Document (PDF)
This endpoint is deprecated and should no longer be used. Instead, use the invoice file subresource to directly download the document by specifying the id of the invoice.
Sample request

curl https://api.lexware.io/v1/invoices/e9066f04-8cc7-4616-93f8-ac9ecc8479c8/document
-X GET
-H "Authorization: Bearer {accessToken}"
-H "Accept: application/json"
Sample response

{
  "documentFileId": "b26e1d73-19ff-46b1-8929-09d8d73d4167"
}
GET {resourceurl}/v1/invoices/{id}/document

To download the PDF file of an invoice document, you need its documentFileId. This id is usually returned by the invoice resource. However, PDF document file rendering must be triggered separately via this endpoint for invoices created through the API with the status open.

The returned documentFileId can be used to download the invoice PDF document via the Files Endpoint.

For invoices in draft mode, there does not exist a document file in Lexware. Any request attempts are rejected with 406 responses.
Download an Invoice File
GET {resourceurl}/v1/invoices/{id}/file

Sample request to download an invoice file

curl "https://api.lexware.io/v1/invoices/{id}/file"
-X GET
-H "Accept: */*"
-H "Authorization: Bearer {accessToken}"
Returns the file as binary data with HTTP response code 200. The HTTP header fields Content-Type specifies the file type (MIME type) and the Content-Length the size of the file in bytes. A suggested file name is returned in the header Content-Disposition.

For an invoice, there can be multiple files associated with a single voucher document. Foremost, this includes e-invoices which provide a pdf and an xml representation. Use the Accept header as decribed below to choose between the downloaded formats.
For an invoice both regular invoices as well as e-invoices are supported.

Regular invoices are only available in PDF format. E-invoices that include embedded XML data (e.g. ZUGFeRD invoices) can also only be downloaded as PDF files. E-invoices of the type XRechnung can be downloaded either in XML or in PDF format. Lexware generates the PDF of an XRechnung solely as a preview. It is not a valid e-invoice and should not be used as one. By sending different Accept headers, the client can choose which representation they want to retrieve.

Accept headers with wildcards are also supported and will return the default representation.

Here's a list of which file type (or which HTTP error) is returned for each voucher type and Accept header combination:

document profile	*/*	application/xml	application/pdf
XRechnung	.xml	.xml	.pdf
ZUGFeRD	.pdf	404	.pdf
regular PDF	.pdf	404	.pdf
If the invoice itself does not exist, the request will be rejected with 404 Not Found.

Requests for other media types than application/pdf, application/xml and */* will generally be rejected with an HTTP status of 406 Not Acceptable.

For invoices in draft mode, there does not exist a document file in Lexware. Any request attempts are rejected with 409 responses.
Deeplink to an Invoice
Invoices can be directly accessed by permanent HTTPS links to either be viewed or to be edited. If an invoice is not allowed to be edited, a redirection to the view page takes place. In case the given id does not exist, a redirection to the main voucher list takes place.

View URL {appbaseurl}/permalink/invoices/view/{id}

Edit URL {appbaseurl}/permalink/invoices/edit/{id}

Order Confirmations Endpoint
Purpose
This endpoint provides read and write access to order confirmations and also the possibility to render the document as a PDF in order to download it. Order confirmations can be created as a draft or finalized in open mode.

It is possible to create order confirmations with value-added tax such as of type net (Netto), gross (Brutto) or different types of vat-free. For tax-exempt organizations vat-free (Steuerfrei) order confirmations can be created exclusively. All other vat-free tax types are only usable in combination with a referenced contact in Lexware. For recipients within the EU these are intra-community supply (Innergemeinschaftliche Lieferung gem. §13b UStG), constructional services (Bauleistungen gem. §13b UStG) and external services (Fremdleistungen innerhalb der EU gem. §13b UStG). For order confirmations to third countries, the tax types third party country service (Dienstleistungen an Drittländer) and third party country delivery (Ausfuhrlieferungen an Drittländer) are possible.

Order Confirmations Properties
Sample of an order confirmation with multiple line items. Fields with no content are displayed with "null" just for demonstration purposes.

{
  "id": "e9066f04-8cc7-4616-93f8-ac9ecc8479c8",
  "organizationId": "aa93e8a8-2aa3-470b-b914-caad8a255dd8",
  "createdDate": "2023-04-24T08:20:22.528+02:00",
  "updatedDate": "2023-04-24T08:20:22.528+02:00",
  "version": 0,
  "language": "de",
  "archived": false,
  "voucherStatus": "draft",
  "voucherNumber": "AB1019",
  "voucherDate": "2023-02-22T00:00:00.000+01:00",
  "address": {
    "contactId": null,
    "name": "Bike & Ride GmbH & Co. KG",
    "supplement": "Gebäude 10",
    "street": "Musterstraße 42",
    "city": "Freiburg",
    "zip": "79112",
    "countryCode": "DE"
  },
  "electronicDocumentProfile":"NONE",
  "lineItems": [
    {
      "id": "97b98491-e953-4dc9-97a9-ae437a8052b4",
      "type": "material",
      "name": "Abus Kabelschloss Primo 590 ",
      "description": "· 9,5 mm starkes, smoke-mattes Spiralkabel mit integrierter Halterlösung zur Befestigung am Sattelklemmbolzen · bewährter Qualitäts-Schließzylinder mit praktischem Wendeschlüssel · KabelØ: 9,5 mm, Länge: 150 cm",
      "quantity": 2,
      "unitName": "Stück",
      "unitPrice": {
        "currency": "EUR",
        "netAmount": 13.4,
        "grossAmount": 15.95,
        "taxRatePercentage": 19
      },
      "discountPercentage": 50,
      "lineItemAmount": 13.4
    },
    {
      "id": "dc4c805b-7df1-4310-a548-22be4499eb04",
      "type": "service",
      "name": "Aufwändige Montage",
      "description": "Aufwand für arbeitsintensive Montagetätigkeit",
      "quantity": 1,
      "unitName": "Stunde",
      "unitPrice": {
        "currency": "EUR",
        "netAmount": 8.32,
        "grossAmount": 8.9,
        "taxRatePercentage": 7
      },
      "discountPercentage": 0,
      "lineItemAmount": 8.32
    },
    {
      "id": null,
      "type": "custom",
      "name": "Energieriegel Testpaket",
      "description": null,
      "quantity": 1,
      "unitName": "Stück",
      "unitPrice": {
        "currency": "EUR",
        "netAmount": 5,
        "grossAmount": 5,
        "taxRatePercentage": 0
      },
      "discountPercentage": 0,
      "lineItemAmount": 5
    },
    {
      "type": "text",
      "name": "Freitextposition",
      "description": "This item type can contain either a name or a description or both."
    }
  ],
  "totalPrice": {
    "currency": "EUR",
    "totalNetAmount": 26.72,
    "totalGrossAmount": 29.85,
    "totalTaxAmount": 3.13,
    "totalDiscountAbsolute": null,
    "totalDiscountPercentage": null
  },
  "taxAmounts": [
    {
      "taxRatePercentage": 0,
      "taxAmount": 0,
      "netAmount": 5
    },
    {
      "taxRatePercentage": 7,
      "taxAmount": 0.58,
      "netAmount": 8.32
    },
    {
      "taxRatePercentage": 19,
      "taxAmount": 2.55,
      "netAmount": 13.4
    }
  ],
  "taxConditions": {
    "taxType": "net",
    "taxTypeNote": null
  },
  "paymentConditions": {
    "paymentTermLabel": "10 Tage - 3 %, 30 Tage netto",
    "paymentTermLabelTemplate": "{discountRange} Tage -{discount}, {paymentRange} Tage netto",
    "paymentTermDuration": 30,
    "paymentDiscountConditions": {
      "discountPercentage": 3,
      "discountRange": 10
    }
  },
  "shippingConditions": {
    "shippingDate": "2023-04-22T00:00:00.000+02:00",
    "shippingEndDate": null,
    "shippingType": "delivery"
  },
  "relatedVouchers": [],
  "printLayoutId": "28c212c4-b6dd-11ee-b80a-dbc65f4ceccf",
  "title": "Auftragsbestätigung",
  "introduction": "Ihre bestellten Positionen stellen wir Ihnen hiermit in Rechnung",
  "remark": "Vielen Dank für Ihren Einkauf",
  "deliveryTerms": "Lieferung an die angegebene Lieferadresse"
}
                    Property	Description
id
uuid	Unique id generated on creation by Lexware.
Read-only.
organizationId
uuid	Unique id of the organization the order confirmation belongs to.
Read-only.
createdDate
dateTime	The instant of time when the order confirmation was created by Lexware in format yyyy-MM-ddTHH:mm:ss.SSSXXX as described in RFC 3339/ISO 8601 (e.g. 2023-02-21T00:00:00.000+01:00).
Read-only.
updatedDate
dateTime	The instant of time when the order confirmation was updated by Lexware in format yyyy-MM-ddTHH:mm:ss.SSSXXX as described in RFC 3339/ISO 8601 (e.g. 2023-02-21T00:00:00.000+01:00).
Read-only.
version
integer	Version (revision) number which will be increased on each change to handle optimistic locking.
Read-only.
language
string	Specifies the language of the order confirmation which affects the print document but also set translated default text modules when no values are send (e.g. for introduction). Values accepted in ISO 639-1 code. Possible values are German de (default) and English en.
archived
boolean	Specifies if the order confirmation is only available in the archive in Lexware.
Read-only.
voucherStatus
enum	Specifies the status of the order confirmation. Possible values are draft (is editable) and open (finalized and no longer editable).
Read-only.
voucherNumber
string	The specific number an order confirmation is aware of. This consecutive number set is by Lexware on creation.
Read-only.
voucherDate
dateTime	The date of order confirmation in format yyyy-MM-ddTHH:mm:ss.SSSXXX as described in RFC 3339/ISO 8601 (e.g. 2023-02-21T00:00:00.000+01:00).
address
object	The address of the order confirmation recipient. For details see below.
electronicDocumentProfile
enum	The electronic document profile of the order confirmation. Always contains the value NONE.
Read-only.
lineItems
list	The items of the order confirmation. For details see below.
totalPrice
object	The total price of the order confirmation. For details see below.
taxAmounts
list	The tax amounts for each tax rate. Please note: As done with every read-only element or object all submitted content (POST) will be ignored. For details see below.
Read-only.
taxConditions
object	The tax conditions of the order confirmation. For details see below.
paymentConditions
object	The payment conditions of the order confirmation. The organization's (or contact-specific) default is used if no value was sent. For details see below.
shippingConditions
object	The shipping conditions of the order confirmation. For details see below.
relatedVouchers
list	The related vouchers of the order confirmation. Read-only.
printLayoutId
uuid	(Optional) The id of the print layout to be used for the order confirmation. The organization's default print layout will be used if no value is sent.
title
string	(Optional) A title text. The organization's default is used if no value was sent.
introduction
string	(Optional) An introductory text / header. The organization's default is used if no value was sent.
remark
string	(Optional) A closing text note. The organization's default is used if no value was sent.
deliveryTerms
string	(Optional) Describes the terms for delivery. The organization's (or contact-specific) default is used if no value was sent.
files
object	(Deprecated, will be removed) The document id for the PDF version of the order confirmation. For details see below.
Read-only.
Address Details

There are two main options to address the recipient of an order confirmation. First, using an existing Lexware contact or second, creating a new address.

For referencing an existing contact it is only necessary to provide the UUID of that contact. Usually the billing address is used (for delivery notes, the shipping address will be preferred). Additionally, the referenced address can also be modified for this specific order confirmation. This can be done by setting all required address fields and this deviated address will not be stored back to the Lexware contacts.

The referenced contact needs to have the role customer. For more information please refer to the contacts endpoint.
Otherwise, a new address for the order confirmation recipient can be created. That type of address is called a "one-time address". A one-time address will not create a new contact in Lexware. For instance, this could be useful when it is not needed to create a contact in Lexware for each new order confirmation.

Please get in touch with us if you are not sure which option fits your use case best.

                    Property	Description
contactId
uuid	If the order confirmation recipient is (optionally) registered as a contact in Lexware, this field specifies the related id of the contact.
name
string	The name of the order confirmation recipient. To use an existing contact of an individual person, provide the name in the format {firstname} {lastname}.
supplement
string	(Optional) An address supplement.
street
string	The street (street and street number) of the address.
city
string	The city of the address.
zip
string	The zip code of the address.
countryCode
enum	The ISO 3166 alpha2 country code of the address.
contactPerson
string	The contact person selected while editing the voucher. The primary contact person will be used when creating vouchers via the API with a referenced contactId.
Read-only.
Line Items Details

A maximum of 300 line items can be used in a single order confirmation.
For referencing an existing product or service, it is necessary to provide its UUID. However, all required properties must still be specified for the referencing line item. Additionally, the referenced product or service can be modified by adjusting the input. This deviated data will not be stored back to the product/service in Lexware.

                    Property	Description
id
uuid	The field specifies the related id of a referenced product/service.
type
enum	The type of the item. Possible values are service (the line item is related to a supply of services), material (the line item is related to a physical product), custom (an item without reference in Lexware and has no id) or text (contains only a name and/or a description for informative purposes).
name
string	The name of the item.
description
string	The description of the item.
quantity
number	The amount of the purchased item. The value can contain up to 4 decimals.
unitName
string	The unit name of the purchased item. If the provided unit name is not known in Lexware it will be created on the fly.
unitPrice
object	The unit price of the purchased item. For details see below.
discountPercentage
number	The offered discount for the item. The value can contain up to 2 decimals.
lineItemAmount
number	The total price of this line item. Depending by the selected taxType in taxConditions, the amount must be given either as net or gross. The value can contain up to 2 decimals.
Read-only.
Unit Price Details

                    Property	Description
currency
enum	The currency of the price. Currently only EUR is supported.
netAmount
number	The net price of the unit price. The value can contain up to 4 decimals.
grossAmount
number	The gross price of the unit price. The value can contain up to 4 decimals.
taxRatePercentage
number	The tax rate of the unit price. See the "Supported tax rates" FAQ for more information and a list of possible values.. For vat-free sales vouchers the tax rate percentage must be 0.
Total Price Details

                    Property	Description
currency
string	The currency of the total price. Currently only EUR is supported.
totalNetAmount
number	The total net price over all line items. The value can contain up to 2 decimals.
Read-only.
totalGrossAmount
number	The total gross price over all line items. The value can contain up to 2 decimals.
Read-only.
totalTaxAmount
number	The total tax amount over all line items. The value can contain up to 2 decimals.
Read-only.
totalDiscountAbsolute
number	(Optional) A total discount as absolute value. The value can contain up to 2 decimals.
totalDiscountPercentage
number	(Optional) A total discount relative to the gross amount or net amount dependent on the given tax conditions. A contact-specific default will be set if available and no total discount was send. The value can contain up to 2 decimals.
Tax Amounts Details

                    Property	Description
taxRatePercentage
number	Tax rate as percentage value. See the "Supported tax rates" FAQ for more information and a list of possible values..
taxAmount
number	The total tax amount for this tax rate. The value can contain up to 2 decimals.
netAmount
number	The total net amount for this tax rate. The value can contain up to 2 decimals.
Tax Conditions Details

Sample for vat-free tax conditions

"taxConditions": {
    "taxType": "constructionService13b",
    "taxTypeNote": "Steuerschuldnerschaft des Leistungsempfängers (Reverse Charge)"
}
                    Property	Description
taxType
enum	The tax type for the order confirmation. Possible values are net, gross, vatfree (Steuerfrei), intraCommunitySupply (Innergemeinschaftliche Lieferung gem. §13b UStG), constructionService13b (Bauleistungen gem. §13b UStG), externalService13b (Fremdleistungen innerhalb der EU gem. §13b UStG), thirdPartyCountryService (Dienstleistungen an Drittländer), thirdPartyCountryDelivery (Ausfuhrlieferungen an Drittländer), and photovoltaicEquipment (0% taxation for photovoltaic equipment and installations in Germany starting 2023-01, Material und Leistungen für Photovoltaik-Installationen)
taxSubType
enum	A tax subtype. Only required for dedicated cases. For vouchers referencing a B2C customer in the EU, and with a taxType of net or gross, the taxSubType may be set to distanceSales, or electronicServices. Passing a null value results in a standard voucher.
If the organization's distanceSalesPrinciple (profile endpoint) is set to DESTINATION and this attribute is set to distanceSales or electronicServices, the voucher needs to reference the destination country's tax rates.
taxTypeNote
string	When taxType is set to a vat-free tax type then a note regarding the conditions can be set. When omitted Lexware sets the organization's default.
Payment Conditions Details

The payment conditions are optional and the organization's or contact-specific defaults will be used if ommitted.

                    Property	Description
paymentTermLabel
string	A textual note regarding the payment conditions.
paymentTermLabelTemplate
string	A textual note regarding the payment conditions. This label template may contain variables such as the discount range. These variables are enclosed in curly braces, e.g., {discountRange}.'
Read-only.
paymentTermDuration
integer	The time left (in days) until the payment must be conducted.
paymentDiscountConditions
object	The payment discount conditions for the order confirmation.
Payment Discount Conditions Details

                    Property	Description
discountPercentage
number	The discount offered in return for payment within the discountRange. The value can contain up to 2 decimals.
discountRange
integer	The time left (in days) the discount is valid.
Shipping Conditions Details

                    Property	Description
shippingDate
dateTime	The instant of time when the purchased items have to be shipped. Value in format yyyy-MM-ddTHH:mm:ss.SSSXXX as described in RFC 3339/ISO 8601 (e.g. 2023-02-21T00:00:00.000+01:00).
shippingEndDate
dateTime	An end instant in order to specify a shipping period of time. Value in format yyyy-MM-ddTHH:mm:ss.SSSXXX as described in RFC 3339/ISO 8601 (e.g. 2023-02-21T00:00:00.000+01:00). Must not specify an instant before shippingDate.
shippingType
enum	The type of the shipping. Possible values are service (a service is supplied on shippingDate), serviceperiod (a service is supplied within the period [shippingDate,shippingEndDate] ), delivery (a product is delivered), deliveryperiod (a product is delivered within the period [shippingDate,shippingEndDate]) and none (no shipping date has to be provided)
Related Vouchers Details

The relatedVouchers property documents all existing voucher relations for the current sales voucher. If no related vouchers exist, an empty list will be returned.

                    Property	Description
id
uuid	The related sales voucher's unique id.
voucherNumber
string	The specific number of the related sales voucher.
Read-only.
voucherType
string	Voucher type of the related sales voucher.
All attributes listed above are read-only.

Files Details

The files object with its property documentFileId is deprecated and will be removed.
                    Property	Description
documentFileId
uuid	The id of the order confirmation PDF. To download the order confirmation PDF file please use the files endpoint.
Create an Order Confirmation
Sample request to create an order confirmation

curl https://api.lexware.io/v1/order-confirmations
-X POST
-H "Authorization: Bearer {accessToken}"
-H "Content-Type: application/json"
-H "Accept: application/json"
-d '
{
 "archived": false,
  "voucherDate": "2023-02-22T00:00:00.000+01:00",
   "address": {
   "name": "Bike & Ride GmbH & Co. KG",
    "supplement": "Gebäude 10",
    "street": "Musterstraße 42",
    "city": "Freiburg",
    "zip": "79112",
    "countryCode": "DE"
  },
  "lineItems": [
    {
      "type": "custom",
      "name": "Abus Kabelschloss Primo 590 ",
      "description": "· 9,5 mm starkes, smoke-mattes Spiralkabel mit integrierter Halterlösung zur Befestigung am Sattelklemmbolzen · bewährter Qualitäts-Schließzylinder mit praktischem Wendeschlüssel · KabelØ: 9,5 mm, Länge: 150 cm",
      "quantity": 2,
      "unitName": "Stück",
      "unitPrice": {
        "currency": "EUR",
        "netAmount": 13.4,
        "taxRatePercentage": 19
      },
      "discountPercentage": 50
    },
    {
      "type": "custom",
      "name": "Aufwändige Montage",
      "description": "Aufwand für arbeitsintensive Montagetätigkeit",
      "quantity": 1,
      "unitName": "Stunde",
      "unitPrice": {
        "currency": "EUR",
        "netAmount": 8.32,
        "taxRatePercentage": 7
      },
      "discountPercentage": 0
    },
    {
      "type": "custom",
      "name": "Energieriegel Testpaket",
      "quantity": 1,
      "unitName": "Stück",
      "unitPrice": {
        "currency": "EUR",
        "netAmount": 5,
        "taxRatePercentage": 0
      },
      "discountPercentage": 0
    },
    {
      "type": "text",
      "name": "Strukturieren Sie Ihre Belege durch Text-Elemente.",
      "description": "Das hilft beim Verständnis"
    }
  ],
  "totalPrice": {
    "currency": "EUR"
   },
  "taxConditions": {
    "taxType": "net"
  },
  "paymentConditions": {
    "paymentTermLabel": "10 Tage - 3 %, 30 Tage netto",
    "paymentTermDuration": 30,
    "paymentDiscountConditions": {
      "discountPercentage": 3,
      "discountRange": 10
    }
  },
  "shippingConditions": {
    "shippingDate": "2023-04-22T00:00:00.000+02:00",
    "shippingType": "delivery"
  },
  "title": "Auftragsbestätigung",
  "introduction": "Ihre bestellten Positionen stellen wir Ihnen hiermit in Rechnung",
  "remark": "Vielen Dank für Ihren Einkauf",
  "deliveryTerms": "Lieferung an die angegebene Lieferadresse"
}
'
Sample response

{
  "id": "e9066f04-8cc7-4616-93f8-ac9ecc8479c8",
  "resourceUri": "https://api.lexware.io/v1/order-confirmations/66196c43-bfee-baf3-4335-d610367059db",
  "createdDate": "2023-06-29T15:15:09.447+02:00",
  "updatedDate": "2023-06-29T15:15:09.447+02:00",
  "version": 1
}
POST {resourceurl}/v1/order-confirmations[?finalize=true]

Order confirmations transmitted via the API are created in draft mode per default. To create a finalized order confirmation with status open the optional query parameter finalize has to be set.

The contents of the order confirmation are expected in the request's body as an application/json and must not contain read-only fields. See our FAQ on further information on text fields.

The created order confirmation will be shown in the main voucher list in Lexware: https://app.lexware.de/vouchers.

To provide your end-users access to the created order confirmation please use our deeplink function.

Description of required properties when creating an order confirmation.

                    Property	Required	Notes
voucherDate	Yes	
address	Yes	Nested object. Required fields for address please see below.
lineItems	Yes	List of nested objects. Required fields for lineItems please see below.
totalPrice	Yes	Nested object. Required fields for totalPrice please see below.
taxConditions	Yes	Nested object. Required fields for taxConditions see below.
shippingConditions	Yes	Nested object. Required fields for shippingConditions please see below.
Address Required Properties

Description of required address properties when creating an order confirmation.

                    Property	Required	Notes
contactId	*	Only when referencing an existing Lexware contact.
name	*	Only required when no existing contact is referenced.
countryCode	*	Only required when no existing contact is referenced.
Line Items Required Properties

Description of required lineItem properties when creating an order confirmation.

                    Property	Required	Notes
id	*	Required for type service and material.
type	Yes	Supported values are custom, material, service and text.
name	Yes	
quantity	*	Required for type custom, service and material.
unitName	*	Required for type custom, service and material.
unitPrice	*	Required for type custom, service and material. Nested object. Required fields for unitPrice see below.
Unit Price Required Properties

Description of required unitPrice properties when creating an order confirmation.

                    Property	Required	Notes
currency	Yes	
netAmount	*	Only relevant if taxConditions.taxType != gross is delivered.
grossAmount	*	Only relevant if taxConditions.taxType == gross is delivered.
taxRatePercentage	Yes	Must be 0 for vat-free sales voucher.
Total Price Required Properties

Description of required totalPrice properties when creating an order confirmation.

                    Property	Required	Notes
currency	Yes	
Tax Condition Required Properties

Description of required tax condition properties when creating an order confirmation.

                    Property	Required	Notes
taxType	Yes	Supported values are: gross, net, vatfree, intraCommunitySupply, constructionService13b, externalService13b, thirdPartyCountryService, thirdPartyCountryDelivery.
Shipping Condition Required Properties

Description of required shipping condition properties when creating an order confirmation.

                    Property	Required	Notes
shippingType	Yes	
shippingDate	*	Required for shipping types service, serviceperiod, delivery and deliveryperiod.
shippingEndDate	*	Required for shipping types serviceperiod and deliveryperiod.
Pursue to an Order Confirmation
POST {resourceurl}/v1/order-confirmations?precedingSalesVoucherId={id}

To be able to pursue a sales voucher to an order confirmation, the optional query parameter precedingSalesVoucherId needs to be set. The id value {id} refers to the preceding sales voucher which is going to be pursued.

To get an overview of the valid and possible pursue actions in Lexware, please see the linked sales voucher document chain. The recommended process is highlighted in blue. If the pursue action is not valid, the request will be rejected with 406 response.

If a quotation is referenced by the precedingSalesVoucherId which contains any alternative or optional line items, the request will be rejected with 406 response.
Retrieve an Order Confirmation
Sample request

curl https://api.lexware.io/v1/order-confirmations/e9066f04-8cc7-4616-93f8-ac9ecc8479c8
-X GET
-H "Authorization: Bearer {accessToken}"
-H "Accept: application/json"
Sample response


{
  "id": "e9066f04-8cc7-4616-93f8-ac9ecc8479c8",
  "organizationId": "aa93e8a8-2aa3-470b-b914-caad8a255dd8",
  "createdDate": "2023-04-24T08:20:22.528+02:00",
  "updatedDate": "2023-04-24T08:20:22.528+02:00",
  "version": 0,
  "language": "de",
  "archived": false,
  "voucherStatus": "draft",
  "voucherNumber": "AB1019",
  "voucherDate": "2023-02-22T00:00:00.000+01:00",
  "address": {
    "name": "Bike & Ride GmbH & Co. KG",
    "supplement": "Gebäude 10",
    "street": "Musterstraße 42",
    "city": "Freiburg",
    "zip": "79112",
    "countryCode": "DE"
  },
  "lineItems": [
    {
      "id": "97b98491-e953-4dc9-97a9-ae437a8052b4",
      "type": "material",
      "name": "Abus Kabelschloss Primo 590 ",
      "description": "· 9,5 mm starkes, smoke-mattes Spiralkabel mit integrierter Halterlösung zur Befestigung am Sattelklemmbolzen · bewährter Qualitäts-Schließzylinder mit praktischem Wendeschlüssel · KabelØ: 9,5 mm, Länge: 150 cm",
      "quantity": 2,
      "unitName": "Stück",
      "unitPrice": {
        "currency": "EUR",
        "netAmount": 13.4,
        "grossAmount": 15.95,
        "taxRatePercentage": 19
      },
      "discountPercentage": 50,
      "lineItemAmount": 13.4
    },
    {
      "id": "dc4c805b-7df1-4310-a548-22be4499eb04",
      "type": "service",
      "name": "Aufwändige Montage",
      "description": "Aufwand für arbeitsintensive Montagetätigkeit",
      "quantity": 1,
      "unitName": "Stunde",
      "unitPrice": {
        "currency": "EUR",
        "netAmount": 8.32,
        "grossAmount": 8.9,
        "taxRatePercentage": 7
      },
      "discountPercentage": 0,
      "lineItemAmount": 8.32
    },
    {
      "type": "custom",
      "name": "Energieriegel Testpaket",
      "quantity": 1,
      "unitName": "Stück",
      "unitPrice": {
        "currency": "EUR",
        "netAmount": 5,
        "grossAmount": 5,
        "taxRatePercentage": 0
      },
      "discountPercentage": 0,
      "lineItemAmount": 5
    }
  ],
  "totalPrice": {
    "currency": "EUR",
    "totalNetAmount": 26.72,
    "totalGrossAmount": 29.85,
    "totalTaxAmount": 3.13
  },
  "taxAmounts": [
    {
      "taxRatePercentage": 0,
      "taxAmount": 0,
      "netAmount": 5
    },
    {
      "taxRatePercentage": 7,
      "taxAmount": 0.58,
      "netAmount": 8.32
    },
    {
      "taxRatePercentage": 19,
      "taxAmount": 2.55,
      "netAmount": 13.4
    }
  ],
  "taxConditions": {
    "taxType": "net"
  },
  "paymentConditions": {
    "paymentTermLabel": "10 Tage - 3 %, 30 Tage netto",
    "paymentTermLabelTemplate": "{discountRange} Tage -{discount}, {paymentRange} Tage netto",
    "paymentTermDuration": 30,
    "paymentDiscountConditions": {
      "discountPercentage": 3,
      "discountRange": 10
    }
  },
  "shippingConditions": {
    "shippingDate": "2023-04-22T00:00:00.000+02:00",
    "shippingType": "delivery"
  },
  "title": "Auftragsbestätigung",
  "introduction": "Ihre bestellten Positionen stellen wir Ihnen hiermit in Rechnung",
  "remark": "Vielen Dank für Ihren Einkauf",
  "deliveryTerms": "Lieferung an die angegebene Lieferadresse",
  "files": {
    "documentFileId": "023d5ef7-ad57-46d7-8579-9ffbdf218faf"
  }
}
GET {resourceurl}/v1/order-confirmations/{id}

Returns the order confirmation with id value {id}.

Render an Order Confirmation Document (PDF)
This endpoint is deprecated and should no longer be used. Instead, use the order confirmation file subresource to directly download the document by specifying the id of the order confirmation.
Sample request

curl https://api.lexware.io/v1/order-confirmations/e9066f04-8cc7-4616-93f8-ac9ecc8479c8/document
-X GET
-H "Authorization: Bearer {accessToken}"
-H "Accept: application/json"
Sample response

{
  "documentFileId": "023d5ef7-ad57-46d7-8579-9ffbdf218faf"
}
GET {resourceurl}/v1/order-confirmations/{id}/document

To download the PDF file of an order confirmation document, you need its documentFileId. This id is usually returned by the order confirmation resource. However, PDF document file rendering must be triggered separately via this endpoint for order confirmations created through the API with the status open.

The returned documentFileId can be used to download the order confirmation PDF document via the Files Endpoint.

For order confirmations in draft mode, there does not exist a document file in Lexware. Any request attempts are rejected with 406 responses.
Download an Order Confirmation File
GET {resourceurl}/v1/order-confirmations/{id}/file

Sample request to download an order confirmation file

curl "https://api.lexware.io/v1/order-confirmations/{id}/file"
-X GET
-H "Accept: */*"
-H "Authorization: Bearer {accessToken}"
Returns the file as binary data with HTTP response code 200. The HTTP header fields Content-Type specifies the file type (MIME type) and the Content-Length the size of the file in bytes. A suggested file name is returned in the header Content-Disposition.

For an order confirmation, only PDF files are supported. As Accept header, */* and application/pdf can be used. Accept headers with wildcards are also supported and will return the default representation.

If the order confirmation itself does not exist, the request will be rejected with 404 Not Found.

Requests for other media types will generally be rejected with an HTTP status of 406 Not Acceptable.

For order confirmations in draft mode, there does not exist a document file in Lexware. Any request attempts are rejected with 409 responses.
Deeplink to an Order Confirmation
Order confirmations can be directly accessed by permanent HTTPS links to either be viewed or to be edited. If an order confirmation is not allowed to be edited, a redirection to the view page takes place. In case the given id does not exist, a redirection to the main voucher list takes place.

View URL {appbaseurl}/permalink/order-confirmations/view/{id}

Edit URL {appbaseurl}/permalink/order-confirmations/edit/{id}

Payments Endpoint
Purpose
The payments endpoint provides read access to the payment status of (bookkeeping or sales) vouchers, including invoices and credit notes.

Payments properties
Samples of a payment for different voucher types

{
  "openAmount": 200.00,
  "currency": "EUR",
  "paymentStatus": "openRevenue",
  "voucherType": "invoice",
  "voucherStatus": "open",
  "paymentItems": []
}

{
  "openAmount": 39.90,
  "paymentStatus": "openExpense",
  "currency": "EUR",
  "voucherType": "purchaseinvoice",
  "voucherStatus": "open",
  "paymentItems": [
    {
      "paymentItemType": "manualPayment",
      "postingDate": "2023-11-07T00:00:00.000+01:00",
      "amount": 10.50,
      "currency": "EUR"
    },
    {
      "paymentItemType": "manualPayment",
      "postingDate": "2023-11-13T00:00:00.000+01:00",
      "amount": 20.0,
      "currency": "EUR"
    }
  ]
}

{
  "openAmount": 0.0,
  "currency": "EUR",
  "paymentStatus": "balanced",
  "voucherType": "purchasecreditnote",
  "voucherStatus": "paidoff",
  "paidDate": "2023-07-14T13:42:02.123+02:00",
  "paymentItems": [
    {
      "paymentItemType": "manualPayment",
      "postingDate": "2023-07-14T00:00:00.000+01:00",
      "amount": 119.0,
      "currency": "EUR"
    }
  ]
}

{
  "openAmount": 0.0,
  "paymentStatus": "balanced",
  "currency": "EUR",
  "voucherType": "invoice",
  "voucherStatus": "paid",
  "paidDate": "2023-07-14T13:42:02.123+02:00",
  "paymentItems": [
    {
      "paymentItemType": "manualPayment",
      "postingDate": "2023-07-14T00:00:00.000+01:00",
      "amount": 72.0,
      "currency": "EUR"
    },
    {
      "paymentItemType": "cashDiscount",
      "postingDate": "2023-07-14T00:00:00.000+01:00",
      "amount": 7.85,
      "currency": "EUR"
    }
  ]
}
 Property	Description
openAmount
number	Open amount. Positive value both for revenues and expenses
currency
enum	Always contains the value EUR, the only currently supported currency
paymentStatus
enum	The payment status is one of the values balanced, openRevenue, or openExpense
voucherType
enum	Contains the voucher type: salesinvoice, salescreditnote, purchaseinvoice, purchasecreditnote, invoice, downpaymentinvoice, creditnote
voucherStatus
enum	Contains one of the following voucher states: open, paid, paidoff, voided, transferred, sepadebit
paidDate
dateTime	The date of the last payment for vouchers with voucherStatus paid or paidoff. For other voucher states, paidDate is not set.
paymentItems
list	The payment items of the payment. For details see below.
Payment Items Details

                    Property	Description
paymentItemType
enum	The type of the item. Possible values are partPaymentFinancialTransaction (payment linked to a bank account), partPaymentCreditNote (payment in the form of a credit note), partPaymentCashBox (payment linked to a cash box), manualPayment (payment from a private deposit), cashDiscount ("Skonto"), dunningCosts (additional fee for a dunning), currencyConversion (difference caused by a conversion between currencies) and irrecoverableReceivable (uncollectible debts, e.g., due to debtor's insolvency)
postingDate
dateTime	The posting date of the item in format yyyy-MM-ddTHH:mm:ss.SSSXXX as described in RFC 3339/ISO 8601 (e.g. 2023-02-21T00:00:00.000+01:00)
amount
number	The amount of the item. Positive value both for revenues and expenses
currency
enum	Always contains the value EUR, the only currently supported currency
Please note that the payment status refers to the underlying voucher type. Due to this, an unbalanced (sales) credit note bears an openRevenue payment status, while an unbalanced purchase credit note is in state openExpense. In addition, voided vouchers behave as paid vouchers and are returned as balanced with a zero open amount.

Further information including total amounts about the voucher is available in the respective endpoints (vouchers, invoices, down-payment-invoices, credit-notes).

 The payments endpoint will return an error code for vouchers/voucher types that do not provide payment information (e.g. quotations, vouchers in draft state, credit notes related to invoices, etc.).
Retrieve payment Information
Sample request

curl https://api.lexware.io/v1/payments/1f1dc13c-fd68-11ea-a8b9-ff40c7cabfe0
-X GET
-H "Authorization: Bearer {accessToken}"
-H "Accept: application/json"
Sample Response

{
  "openAmount": "1337.00",
  "currency": "EUR",
  "paymentStatus": "openRevenue",
  "voucherType": "salesinvoice",
  "voucherStatus": "open",
  "paymentItems": [
    {
      "paymentItemType": "manualPayment",
      "postingDate": "2023-11-04T00:00:00.000+01:00",
      "amount": 10.0,
      "currency": "EUR"
    },
    {
      "paymentItemType": "manualPayment",
      "postingDate": "2023-11-06T00:00:00.000+01:00",
      "amount": 39.99,
      "currency": "EUR"
    }
  ]
}
GET {resourceurl}/v1/payments/{voucherId}

The following sample shows how to retrieve payment information of a voucher. It is required to replace the placeholder {accessToken} before sending the request.

Payment Conditions Endpoint
Purpose
The payment conditions endpoint provides read access to the list of payment conditions configured in Lexware.

Payment Conditions properties
The payment conditions are optional and the organization's or contact-specific defaults will be used if ommitted.

                    Property	Description
id
UUID	The payment conditions' identifier
organizationDefault
boolean	True for one payment condition object that was selected by the user as their default, false for all others
paymentTermLabelTemplate
string	A textual note regarding the payment conditions. This label template may contain variables such as the discount range. These variables are enclosed in curly braces, e.g., {discountRange}.'
Read-only.
paymentTermDuration
integer	The time left (in days) until the payment must be conducted.
paymentDiscountConditions
object	The payment discount conditions for the payment condition.
Payment Discount Conditions Details

                    Property	Description
discountPercentage
number	The discount offered in return for payment within the discountRange. The value can contain up to 2 decimals.
discountRange
integer	The time left (in days) the discount is valid.
Retrieve List of Payment Conditions
Sample request

curl https://api.lexware.io/v1/payment-conditions
-X GET
-H "Authorization: Bearer {accessToken}"
-H "Accept: application/json"
Sample Response

[
    {
        "id": "65be0654-60b6-11eb-b66d-5731dbc9bf6b",
        "paymentTermLabelTemplate": "Zahlbar in {paymentRange} Tagen, rein netto ohne Abzug",
        "paymentTermDuration": 14,
        "organizationDefault": false
    },
    {
        "id": "3fcc62d1-0925-456d-890b-779b56e7289e",
        "paymentTermLabelTemplate": "10 Tage - 3 %, 30 Tage netto",
        "paymentTermDuration": 30,
        "paymentDiscountConditions": {
            "discountRange": 10,
            "discountPercentage": 3.00
        },
        "organizationDefault": true
    }
]
GET {resourceurl}/v1/payment-conditions

The following sample shows how to retrieve list of currently configured payment conditions. It is required to replace the placeholder {accessToken} before sending the request.

Posting Categories Endpoint
Purpose
This endpoint provides read access to the list of posting categories for the (bookkeeping) vouchers revenue or expense which are supported in Lexware.

Category ids with type income can be used for revenue vouchers such as salesinvoice and salescreditnote and posting categories with type outgo can be applied for expense vouchers with voucher types purchaseinvoice or purchasecreditnote.

Posting Categories Properties
                    Property	Description
id
UUID	Unique id of the posting category.
name
string	Name of the posting category.
type
string	Type of the posting category. Possible values are income for revenues and outgo for expenses.
contactRequired
boolean	Flags if a referenced contact is required for this posting category. Possible values are true and false.
splitAllowed
boolean	Flags if items with different tax rate percentages (e.g. 7% and 19%) are allowed for this posting category. Possible values are true and false.
groupName
string	Name of the top level posting category.
Retrieve List of Posting Categories
Sample request

curl https://api.lexware.io/v1/posting-categories
-X GET
-H "Authorization: Bearer {accessToken}"
-H "Accept: application/json"
Sample Response

[
  {
      "id": "cf03a2b0-f838-474f-ac5e-67adb9b830c7",
      "name": "Reise MA",
      "type": "outgo",
      "contactRequired": false,
      "splitAllowed": true,
      "groupName": "Reisen"
  },
  {
      "id": "3620798f-ae06-4492-b775-1c87eb99247c",
      "name": "Fahrtkosten MA",
      "type": "outgo",
      "contactRequired": false,
      "splitAllowed": true,
      "groupName": "Reisen"
  },
  {
      "id": "8f8664a1-fd86-11e1-a21f-0800200c9a66",
      "name": "Einnahmen",
      "type": "income",
      "contactRequired": false,
      "splitAllowed": true,
      "groupName": "Einnahmen"
  },
  {
      "id": "8f8664a0-fd86-11e1-a21f-0800200c9a66",
      "name": "Dienstleistung",
      "type": "income",
      "contactRequired": false,
      "splitAllowed": true,
      "groupName": "Einnahmen"
  }
]
GET {resourceurl}/v1/posting-categories

The following sample shows how to retrieve list of currently known posting categories. It is required to replace the placeholder {accessToken} before sending the request.

Print Layouts Endpoint
Purpose
The print layouts endpoint provides read-only access to the list of print layouts for sales vouchers of a given account.

These layouts may be referenced when creating sales vouchers, e.g. using the invoices endpoint. One of the layouts may be set as the default for the organization, and will be used when creating sales vouchers without specifying a layout.

Print Layout Properties
                    Property	Description
id
uuid	The unique identifier for the print layout.
name
string	The name of the print layout as set by the user.
default
boolean	Whether or not the print layout is the default for the selected organization.
Retrieve list of print layouts
GET {resourceurl}/v1/print-layouts

The following sample shows how to retrieve the list of print layouts. It is required to replace the placeholder {accessToken} before sending the request.

Sample request

curl https://api.lexware.io/v1/print-layouts
-X GET
-H "Authorization: Bearer {accessToken}"
-H "Accept: application/json"
Sample Response

[
    {
        "id": "0dda299a-b5db-11ee-93dd-1755da51b5dc",
        "name": "Standard",
        "default": true
    },
    {
        "id": "1ecf228c-b5db-11ee-bdaa-bbbd077b15cd",
        "name": "Alternate layout",
        "default": false
    }
]
Profile Endpoint
Purpose
The profile endpoint provides read access to basic profile information such as company name, user id, name and email of the connected Lexware account.

Profile Properties
                    Property	Description
organizationId
uuid	Unique id of your company.
companyName
string	Name of your company registered at Lexware.
created
object	Information about the established connection to Lexware. For specification of object created please see below.
connectionId
uuid	The id of the current API connection.
taxType
enum	Configured tax type. Possible values are net, gross, and vatfree.
distanceSalesPrinciple
enum	The distance sales principle configured by the user, or undefined if not yet set. Possible values are ORIGIN and DESTINATION. See the in-app documentation (Section "Umsatzsteuer bei Privatpersonen im EU-Ausland" in https://app.lexware.de/settings/#/general) for information about the implications of this setting.
businessFeatures
list	A list of business features available for the registered organization. See the section below for more information on possible values.
smallBusiness
boolean	Reflects whether the organization is marked as a "small business" (Kleinunternehmer according to §19 UStG.)
Object created Details

                    Property	Description
userId
uuid	Unique id of the user who established the connection to Lexware.
userName
string	The user who established the connection to Lexware.
userEmail
string	The user's email who established the connection to Lexware.
date
string	The date when the connection was established in format yyyy-MM-ddTHH:mm:ss.SSSXXX as described in RFC 3339/ISO 8601 (e.g. 2023-02-21T00:00:00.000+01:00).
Lexware Business Features

An organization is granted a number of features based on the chosen Lexware contract. As some of these features are orthogonal to the scopes, and even may change over time, it may be required to request the available set of features. The following list contains the possible values of the businessFeature attribute.

 Property	Description
INVOICING	The organization has basic access to the Lexware invoicing component.
INVOICING_PRO	The organization has access to the extended Lexware invoicing features, including invoices in English, invoices for foreign countries, XRechnung, access to print layouts, and others.
BOOKKEEPING	The organization has access to the regular (i.e., non-basic) bookkeeping features.
Retrieve Profile Information
Sample request

curl https://api.lexware.io/v1/profile
-X GET
-H "Authorization: Bearer {accessToken}"
-H "Accept: application/json"
Sample Response

{
  "organizationId": "aa93e8a8-2aa3-470b-b914-caad8a255dd8",
  "companyName": "Testfirma GmbH",
  "created": {
    "userId": "1aea5501-3f3e-403d-8492-2dad03016289",
    "userName": "Frau Erika Musterfrau",
    "userEmail": "erika.musterfrau@testfirma.de",
    "date": "2017-01-03T13:15:45.000+01:00"
  },
  "connectionId": "3dea098a-fae5-4458-a85c-f97965966c25",
  "features": [
    "cashbox"
  ],
  "businessFeatures": [
    "INVOICING",
    "INVOICING_PRO",
    "BOOKKEEPING"
  ],
  "subscriptionStatus": "active",
  "taxType": "net",
  "smallBusiness": false
}
GET {resourceurl}/v1/profile

The following sample shows how to retrieve your basic profile information. It is required to replace the placeholder {accessToken} before sending the request.

Quotations Endpoint
Purpose
This endpoint provides read and write access to quotations and also the possibility to render the document as a PDF in order to download it. Quotations can be created as a draft or finalized in open mode.

Please note that Public API connections that were established prior to the release of the quotations endpoint (see Change Log) are not automatically granted the permission for quotations access. Re-generate a new Public API key to benefit from quotations access.

It is possible to create quotations with value-added tax such as of type net (Netto), gross (Brutto) or different types of vat-free. For tax-exempt organizations vat-free (Steuerfrei) quotations can be created exclusively. All other vat-free tax types are only usable in combination with a referenced contact in Lexware. For recipients within the EU these are intra-community supply (Innergemeinschaftliche Lieferung gem. §13b UStG), constructional services (Bauleistungen gem. §13b UStG) and external services (Fremdleistungen innerhalb der EU gem. §13b UStG). For quotations to third countries, the tax types third party country service (Dienstleistungen an Drittländer) and third party country delivery (Ausfuhrlieferungen an Drittländer) are possible.

Quotations Properties
Sample of a quotation with multiple line items. Fields with no content are displayed with "null" just for demonstration purposes.

{
    "id": "424f784e-1f4e-439e-8f71-19673e6d6583",
    "organizationId": "aa93e8a8-2aa3-470b-b914-caad8a255dd8",
    "createdDate": "2023-03-16T12:43:16.689+01:00",
    "updatedDate": "2023-03-16T15:26:30.074+01:00",
    "version": 4,
    "language": "de",
    "archived": false,
    "voucherStatus": "open",
    "voucherNumber": "AG0006",
    "voucherDate": "2023-03-16T12:43:03.900+01:00",
    "expirationDate": "2023-04-15T12:43:03.900+02:00",
    "address": {
        "contactId": "97c5794f-8ab2-43ad-b459-c5980b055e4d",
        "name": "Berliner Kindl GmbH",
        "street": "Jubiläumsweg 25",
        "city": "Berlin",
        "zip": "14089",
        "countryCode": "DE"
    },
    "electronicDocumentProfile":"NONE",
    "lineItems": [
        {
            "id": "68569bfc-e5ae-472d-bbdf-6d51a82b1d2f",
            "type": "material",
            "name": "Axa Rahmenschloss Defender RL",
            "description": "Vollständig symmetrisches Design in metallicfarbener Ausführung. Der ergonomische Bedienkopf garantiert die große Benutzerfreundlichkeit dieses Schlosses. Sehr niedrige Kopfhöhe von 46 mm, also mehr Rahmenfreiheit... ",
            "quantity": 1,
            "unitName": "Stück",
            "unitPrice": {
                "currency": "EUR",
                "netAmount": 20.08,
                "grossAmount": 23.9,
                "taxRatePercentage": 19
            },
            "discountPercentage": 0,
            "lineItemAmount": 23.90,
            "subItems": [
                {
                    "id": "97b98491-e953-4dc9-97a9-ae437a8052b4",
                    "type": "material",
                    "name": "Abus Kabelschloss Primo 590 ",
                    "description": "· 9,5 mm starkes, smoke-mattes Spiralkabel mit integrierter Halterlösung zur Befestigung am Sattelklemmbolzen · bewährter Qualitäts-Schließzylinder mit praktischem Wendeschlüssel · KabelØ: 9,5 mm, Länge: 150 cm",
                    "quantity": 1,
                    "unitName": "Stück",
                    "unitPrice": {
                        "currency": "EUR",
                        "netAmount": 13.4,
                        "grossAmount": 15.95,
                        "taxRatePercentage": 19
                    },
                    "discountPercentage": 0,
                    "lineItemAmount": 15.95,
                    "alternative": true,
                    "optional": false
                }
            ],
            "alternative": false,
            "optional": false
        },
        {
            "id": "0722bcc6-d1b7-417b-b834-3b47794fa9ab",
            "type": "service",
            "name": "Einfache Montage",
            "description": "Aufwand für einfache Montagetätigkeit",
            "quantity": 1,
            "unitName": "Stunde",
            "unitPrice": {
                "currency": "EUR",
                "netAmount": 4.12,
                "grossAmount": 4.9,
                "taxRatePercentage": 19
            },
            "discountPercentage": 0,
            "lineItemAmount": 4.90,
            "alternative": false,
            "optional": true
        }
    ],
    "totalPrice": {
        "currency": "EUR",
        "totalNetAmount": 20.08,
        "totalGrossAmount": 23.90,
        "totalTaxAmount": 3.82
    },
    "taxAmounts": [
        {
            "taxRatePercentage": 19,
            "taxAmount": 3.82,
            "netAmount": 20.08
        }
    ],
    "taxConditions": {
        "taxType": "gross"
    },
    "paymentConditions": {
        "paymentTermLabel": "10 Tage - 3 %, 30 Tage netto",
        "paymentTermLabelTemplate": "{discountRange} Tage -{discount}, {paymentRange} Tage netto",
        "paymentTermDuration": 30,
        "paymentDiscountConditions": {
            "discountPercentage": 3,
            "discountRange": 10
        }
    },
    "relatedVouchers": [],
    "printLayoutId": "28c212c4-b6dd-11ee-b80a-dbc65f4ceccf",
    "introduction": "Gerne bieten wir Ihnen an:",
    "remark": "Wir freuen uns auf Ihre Auftragserteilung und sichern eine einwandfreie Ausführung zu.",
    "files": {
        "documentFileId": "ebd84e8a-716d-4a20-a76d-21de75a6d3d1"
    },
    "title": "Angebot"
}
                    Property	Description
id
uuid	Unique id generated on creation by Lexware.
Read-only.
organizationId
uuid	Unique id of the organization the quotation belongs to.
Read-only.
createdDate
dateTime	The instant of time when the quotation was created by Lexware in format yyyy-MM-ddTHH:mm:ss.SSSXXX as described in RFC 3339/ISO 8601 (e.g. 2023-02-21T00:00:00.000+01:00).
Read-only.
updatedDate
dateTime	The instant of time when the quotation was updated by Lexware in format yyyy-MM-ddTHH:mm:ss.SSSXXX as described in RFC 3339/ISO 8601 (e.g. 2023-02-21T00:00:00.000+01:00).
Read-only.
expirationDate
dateTime	The instant of time when the quotation will expire. Value in format yyyy-MM-ddTHH:mm:ss.SSSXXX as described in RFC 3339/ISO 8601 (e.g. 2023-02-21T00:00:00.000+01:00).
version
integer	Version (revision) number which will be increased on each change to handle optimistic locking.
Read-only.
language
string	Specifies the language of the quotation which affects the print document but also set translated default text modules when no values are send (e.g. for introduction). Values accepted in ISO 639-1 code. Possible values are German de (default) and English en.
archived
boolean	Specifies if the quotation is only available in the archive in Lexware.
Read-only.
voucherStatus
enum	Specifies the status of the quotation. Possible values are draft (is editable), open (finalized and no longer editable but yet neither accepted nor rejected), accepted (has been accepted by the customer), rejected (rejected by the customer)
Read-only.
voucherNumber
string	The specific number a quotation is aware of. This consecutive number is set by Lexware on creation.
Read-only.
voucherDate
dateTime	The date of quotation in format yyyy-MM-ddTHH:mm:ss.SSSXXX as described in RFC 3339/ISO 8601 (e.g. 2023-02-21T00:00:00.000+01:00).
address
object	The address of the quotation recipient. For details see below.
electronicDocumentProfile
enum	The electronic document profile of the quotation. Always contains the value NONE.
Read-only.
lineItems
list	The items of the quotation. For details see below.
totalPrice
object	The total price of the quotation. For details see below.
taxAmounts
list	The tax amounts for each tax rate. Please note: As done with every read-only element or object all submitted content (POST) will be ignored. For details see below.
Read-only.
taxConditions
object	The tax conditions of the quotation. For details see below.
paymentConditions
object	The payment conditions of the quotation. The organization's (or contact-specific) default is used if no value was sent. For details see below.
relatedVouchers
list	The related vouchers of the quotation. Read-only.
printLayoutId
uuid	(Optional) The id of the print layout to be used for the quotation. The organization's default print layout will be used if no value is sent.
title
string	(Optional) A title text. The organization's default is used if no value was sent.
introduction
string	(Optional) An introductory text / header. The organization's default is used if no value was sent.
remark
string	(Optional) A closing text note. The organization's default is used if no value was sent.
files
object	(Deprecated, will be removed) The document id for the PDF version of the quotation. For details see below.
Read-only.
Address Details

There are two main options to address the recipient of a quotation. First, using an existing Lexware contact or second, creating a new address.

For referencing an existing contact it is only necessary to provide the UUID of that contact. Usually the billing address is used (for delivery notes, the shipping address will be preferred). Additionally, the referenced address can also be modified for this specific quotation. This can be done by setting all required address fields and this deviated address will not be stored back to the Lexware contacts.

The referenced contact needs to have the role customer. For more information please refer to the contacts endpoint.
Otherwise, a new address for the quotation recipient can be created. That type of address is called a "one-time address". A one-time address will not create a new contact in Lexware. For instance, this could be useful when it is not needed to create a contact in Lexware for each new quotation.

Please get in touch with us if you are not sure which option fits your use case best.

                    Property	Description
contactId
uuid	If the quotation recipient is (optionally) registered as a contact in Lexware, this field specifies the related id of the contact.
name
string	The name of the quotation recipient. To use an existing contact of an individual person, provide the name in the format {firstname} {lastname}.
supplement
string	(Optional) An address supplement.
street
string	The street (street and street number) of the address.
city
string	The city of the address.
zip
string	The zip code of the address.
countryCode
enum	The ISO 3166 alpha2 country code of the address.
contactPerson
string	The contact person selected while editing the voucher. The primary contact person will be used when creating vouchers via the API with a referenced contactId.
Read-only.
Line Items Details

A maximum of 300 line items can be used in a single quotation.
For referencing an existing product or service, it is necessary to provide its UUID. However, all required properties must still be specified for the referencing line item. Additionally, the referenced product or service can be modified by adjusting the input. This deviated data will not be stored back to the product/service in Lexware.

                    Property	Description
id
uuid	The field specifies the related id of a referenced product/service.
type
enum	The type of the item. Possible values are service (the line item is related to a supply of services), material (the line item is related to a physical product), custom (an item without reference in Lexware and has no id) or text (contains only a name and/or a description for informative purposes).
name
string	The name of the item.
description
string	The description of the item.
quantity
number	The amount of the purchased item. The value can contain up to 4 decimals.
unitName
string	The unit name of the purchased item. If the provided unit name is not known in Lexware it will be created on the fly.
unitPrice
object	The unit price of the purchased item. For details see below.
discountPercentage
number	The offered discount for the item. The value can contain up to 2 decimals.
lineItemAmount
number	The total price of this line item. Depending by the selected taxType in taxConditions, the amount must be given either as net or gross. The value can contain up to 2 decimals.
Read-only.
subItems
List of line item objects	A list of subitems of this line item. At this time, all subItems need to be alternative items.
optional
boolean	If true, the line item is optional ("Optionale Position"). Not a valid attribute for subitems. Defaults to false if unset
alternative
boolean	If true, the line item is an alternative position for its parent item. Currently only valid for subitems, and mandatory to be true in that case. Defaults to false if unset
Unit Price Details

                    Property	Description
currency
enum	The currency of the price. Currently only EUR is supported.
netAmount
number	The net price of the unit price. The value can contain up to 4 decimals.
grossAmount
number	The gross price of the unit price. The value can contain up to 4 decimals.
taxRatePercentage
number	The tax rate of the unit price. See the "Supported tax rates" FAQ for more information and a list of possible values.. For vat-free sales vouchers the tax rate percentage must be 0.
Total Price Details

                    Property	Description
currency
string	The currency of the total price. Currently only EUR is supported.
totalNetAmount
number	The total net price over all line items. The value can contain up to 2 decimals.
Read-only.
totalGrossAmount
number	The total gross price over all line items. The value can contain up to 2 decimals.
Read-only.
totalTaxAmount
number	The total tax amount over all line items. The value can contain up to 2 decimals.
Read-only.
totalDiscountAbsolute
number	(Optional) A total discount as absolute value. The value can contain up to 2 decimals.
totalDiscountPercentage
number	(Optional) A total discount relative to the gross amount or net amount dependent on the given tax conditions. A contact-specific default will be set if available and no total discount was send. The value can contain up to 2 decimals.
Tax Amounts Details

                    Property	Description
taxRatePercentage
number	Tax rate as percentage value. See the "Supported tax rates" FAQ for more information and a list of possible values..
taxAmount
number	The total tax amount for this tax rate. The value can contain up to 2 decimals.
netAmount
number	The total net amount for this tax rate. The value can contain up to 2 decimals.
Tax Conditions Details

Sample for vat-free tax conditions

"taxConditions": {
    "taxType": "constructionService13b",
    "taxTypeNote": "Steuerschuldnerschaft des Leistungsempfängers (Reverse Charge)"
}
                    Property	Description
taxType
enum	The tax type for the quotation. Possible values are net, gross, vatfree (Steuerfrei), intraCommunitySupply (Innergemeinschaftliche Lieferung gem. §13b UStG), constructionService13b (Bauleistungen gem. §13b UStG), externalService13b (Fremdleistungen innerhalb der EU gem. §13b UStG), thirdPartyCountryService (Dienstleistungen an Drittländer), thirdPartyCountryDelivery (Ausfuhrlieferungen an Drittländer), and photovoltaicEquipment (0% taxation for photovoltaic equipment and installations in Germany starting 2023-01, Material und Leistungen für Photovoltaik-Installationen)
taxSubType
enum	A tax subtype. Only required for dedicated cases. For vouchers referencing a B2C customer in the EU, and with a taxType of net or gross, the taxSubType may be set to distanceSales, or electronicServices. Passing a null value results in a standard voucher.
If the organization's distanceSalesPrinciple (profile endpoint) is set to DESTINATION and this attribute is set to distanceSales or electronicServices, the voucher needs to reference the destination country's tax rates.
taxTypeNote
string	When taxType is set to a vat-free tax type then a note regarding the conditions can be set. When omitted Lexware sets the organization's default.
Payment Conditions Details

The payment conditions are optional and the organization's or contact-specific defaults will be used if ommitted.

                    Property	Description
paymentTermLabel
string	A textual note regarding the payment conditions.
paymentTermLabelTemplate
string	A textual note regarding the payment conditions. This label template may contain variables such as the discount range. These variables are enclosed in curly braces, e.g., {discountRange}.'
Read-only.
paymentTermDuration
integer	The time left (in days) until the payment must be conducted.
paymentDiscountConditions
object	The payment discount conditions for the quotation.
Payment Discount Conditions Details

                    Property	Description
discountPercentage
number	The discount offered in return for payment within the discountRange. The value can contain up to 2 decimals.
discountRange
integer	The time left (in days) the discount is valid.
Related Vouchers Details

The relatedVouchers property documents all existing voucher relations for the current sales voucher. If no related vouchers exist, an empty list will be returned.

                    Property	Description
id
uuid	The related sales voucher's unique id.
voucherNumber
string	The specific number of the related sales voucher.
Read-only.
voucherType
string	Voucher type of the related sales voucher.
All attributes listed above are read-only.

Files Details

The files object with its property documentFileId is deprecated and will be removed.
                    Property	Description
documentFileId
uuid	The id of the quotation PDF. The PDF will be created when the quotation turns from draft into status open. To download the quotation PDF file please use the files endpoint.
Create a Quotation
Sample request to create a quotation

curl https://api.lexware.io/v1/quotations
-X POST
-H "Authorization: Bearer {accessToken}"
-H "Content-Type: application/json"
-H "Accept: application/json"
-d '
{
    "organizationId": "aa93e8a8-2aa3-470b-b914-caad8a255dd8",
    "version": 4,
    "language": "de",
    "voucherDate": "2023-03-16T12:43:03.900+01:00",
    "expirationDate": "2023-04-15T12:43:03.900+02:00",
    "address": {
        "contactId": "97c5794f-8ab2-43ad-b459-c5980b055e4d",
        "name": "Berliner Kindl GmbH",
        "street": "Jubiläumsweg 25",
        "city": "Berlin",
        "zip": "14089",
        "countryCode": "DE"
    },
    "lineItems": [
        {
            "type": "custom",
            "name": "Axa Rahmenschloss Defender RL",
            "description": "Vollständig symmetrisches Design in metallicfarbener Ausführung. Der ergonomische Bedienkopf garantiert die große Benutzerfreundlichkeit dieses Schlosses. Sehr niedrige Kopfhöhe von 46 mm, also mehr Rahmenfreiheit... ",
            "quantity": 1,
            "unitName": "Stück",
            "unitPrice": {
                "currency": "EUR",
                "netAmount": 20.08,
                "grossAmount": 23.9,
                "taxRatePercentage": 19
            },
            "discountPercentage": 0,
            "lineItemAmount": 23.90,
            "subItems": [
                {
                    "type": "custom",
                    "name": "Abus Kabelschloss Primo 590 ",
                    "description": "· 9,5 mm starkes, smoke-mattes Spiralkabel mit integrierter Halterlösung zur Befestigung am Sattelklemmbolzen · bewährter Qualitäts-Schließzylinder mit praktischem Wendeschlüssel · KabelØ: 9,5 mm, Länge: 150 cm",
                    "quantity": 1,
                    "unitName": "Stück",
                    "unitPrice": {
                        "currency": "EUR",
                        "netAmount": 13.4,
                        "grossAmount": 15.95,
                        "taxRatePercentage": 19
                    },
                    "discountPercentage": 0,
                    "lineItemAmount": 15.95,
                    "alternative": true,
                    "optional": false
                }
            ],
            "alternative": false,
            "optional": false
        },
        {
            "type": "custom",
            "name": "Einfache Montage",
            "description": "Aufwand für einfache Montagetätigkeit",
            "quantity": 1,
            "unitName": "Stunde",
            "unitPrice": {
                "currency": "EUR",
                "netAmount": 4.12,
                "grossAmount": 4.9,
                "taxRatePercentage": 19
            },
            "discountPercentage": 0,
            "lineItemAmount": 4.90,
            "alternative": false,
            "optional": true
        }
    ],
    "totalPrice": {
        "currency": "EUR",
        "totalNetAmount": 20.08,
        "totalGrossAmount": 23.90,
        "totalTaxAmount": 3.82
    },
    "taxAmounts": [
        {
            "taxRatePercentage": 19,
            "taxAmount": 3.82,
            "netAmount": 20.08
        }
    ],
    "taxConditions": {
        "taxType": "gross"
    },
    "paymentConditions": {
        "paymentTermLabel": "10 Tage - 3 %, 30 Tage netto",
        "paymentTermDuration": 30,
        "paymentDiscountConditions": {
            "discountPercentage": 3,
            "discountRange": 10
        }
    },
    "introduction": "Gerne bieten wir Ihnen an:",
    "remark": "Wir freuen uns auf Ihre Auftragserteilung und sichern eine einwandfreie Ausführung zu.",
    "title": "Angebot"
}
'
Sample response

{
  "id": "a6d29b44-e5c1-43f2-9403-6859aba4104a",
  "resourceUri": "https://api.lexware.io/v1/quotations/a6d29b44-e5c1-43f2-9403-6859aba4104a",
  "createdDate": "2023-03-18T12:37:25.616+01:00",
  "updatedDate": "2023-03-18T12:37:25.616+01:00",
  "version": 1
}
POST {resourceurl}/v1/quotations[?finalize=true]

Quotations transmitted via the API are created in draft mode per default. To create a finalized quotation with status open the optional query parameter finalize has to be set. The status of a quotation cannot be changed via the api.

The created quotation will be shown in the main voucher list in Lexware: https://app.lexware.de/vouchers. To provide your end-users access to the created quotation please use our deeplink function.

The contents of the quotation are expected in the request's body as an application/json and must not contain read-only fields. See our FAQ on further information on text fields.

Description of required properties when creating a quotation.

                    Property	Required	Notes
voucherDate	Yes	
expirationDate	Yes	
address	Yes	Nested object. Required fields for address please see below.
lineItems	Yes	List of nested objects. Required fields for lineItems please see below.
totalPrice	Yes	Nested object. Required fields for totalPrice please see below.
taxConditions	Yes	Nested object. Required fields for taxConditions see below.
Address Required Properties

Description of required address properties when creating a quotation.

                    Property	Required	Notes
contactId	*	Only when referencing an existing Lexware contact.
name	*	Only required when no existing contact is referenced.
countryCode	*	Only required when no existing contact is referenced.
Line Items Required Properties

Description of required lineItem properties when creating a quotation.

                    Property	Required	Notes
id	*	Required for type service and material.
type	Yes	Supported values are custom, material, service and text.
name	Yes	
quantity	*	Required for type custom, service and material.
unitName	*	Required for type custom, service and material.
unitPrice	*	Required for type custom, service and material. Nested object. Required fields for unitPrice see below.
Unit Price Required Properties

Description of required unitPrice properties when creating a quotation.

                    Property	Required	Notes
currency	Yes	
netAmount	*	Only relevant if taxConditions.taxType != gross is delivered.
grossAmount	*	Only relevant if taxConditions.taxType == gross is delivered.
taxRatePercentage	Yes	Must be 0 for vat-free sales voucher.
Total Price Required Properties

Description of required totalPrice properties when creating a quotation.

                    Property	Required	Notes
currency	Yes	
Tax Condition Required Properties

Description of required tax condition properties when creating a quotation.

                    Property	Required	Notes
taxType	Yes	Supported values are: gross, net, vatfree, intraCommunitySupply, constructionService13b, externalService13b, thirdPartyCountryService, thirdPartyCountryDelivery.
Retrieve a Quotation
Sample request

curl https://api.lexware.io/v1/quotations/424f784e-1f4e-439e-8f71-19673e6d6583
-X GET
-H "Authorization: Bearer {accessToken}"
-H "Content-Type: application/json"
-H "Accept: application/json"
Sample response

{
    "id": "424f784e-1f4e-439e-8f71-19673e6d6583",
    "organizationId": "aa93e8a8-2aa3-470b-b914-caad8a255dd8",
    "createdDate": "2023-03-16T12:43:16.689+01:00",
    "updatedDate": "2023-03-16T15:26:30.074+01:00",
    "version": 4,
    "language": "de",
    "archived": false,
    "voucherStatus": "open",
    "voucherNumber": "AG0006",
    "voucherDate": "2023-03-16T12:43:03.900+01:00",
    "expirationDate": "2023-04-15T12:43:03.900+02:00",
    "address": {
        "contactId": "97c5794f-8ab2-43ad-b459-c5980b055e4d",
        "name": "Berliner Kindl GmbH",
        "street": "Jubiläumsweg 25",
        "city": "Berlin",
        "zip": "14089",
        "countryCode": "DE"
    },
    "lineItems": [
        {
            "id": "68569bfc-e5ae-472d-bbdf-6d51a82b1d2f",
            "type": "material",
            "name": "Axa Rahmenschloss Defender RL",
            "description": "Vollständig symmetrisches Design in metallicfarbener Ausführung. Der ergonomische Bedienkopf garantiert die große Benutzerfreundlichkeit dieses Schlosses. Sehr niedrige Kopfhöhe von 46 mm, also mehr Rahmenfreiheit... ",
            "quantity": 1,
            "unitName": "Stück",
            "unitPrice": {
                "currency": "EUR",
                "netAmount": 20.08,
                "grossAmount": 23.9,
                "taxRatePercentage": 19
            },
            "discountPercentage": 0,
            "lineItemAmount": 23.90,
            "subItems": [
                {
                    "id": "97b98491-e953-4dc9-97a9-ae437a8052b4",
                    "type": "material",
                    "name": "Abus Kabelschloss Primo 590 ",
                    "description": "· 9,5 mm starkes, smoke-mattes Spiralkabel mit integrierter Halterlösung zur Befestigung am Sattelklemmbolzen · bewährter Qualitäts-Schließzylinder mit praktischem Wendeschlüssel · KabelØ: 9,5 mm, Länge: 150 cm",
                    "quantity": 1,
                    "unitName": "Stück",
                    "unitPrice": {
                        "currency": "EUR",
                        "netAmount": 13.4,
                        "grossAmount": 15.95,
                        "taxRatePercentage": 19
                    },
                    "discountPercentage": 0,
                    "lineItemAmount": 15.95,
                    "alternative": true,
                    "optional": false
                }
            ],
            "alternative": false,
            "optional": false
        },
        {
            "id": "0722bcc6-d1b7-417b-b834-3b47794fa9ab",
            "type": "service",
            "name": "Einfache Montage",
            "description": "Aufwand für einfache Montagetätigkeit",
            "quantity": 1,
            "unitName": "Stunde",
            "unitPrice": {
                "currency": "EUR",
                "netAmount": 4.12,
                "grossAmount": 4.9,
                "taxRatePercentage": 19
            },
            "discountPercentage": 0,
            "lineItemAmount": 4.90,
            "alternative": false,
            "optional": true
        }
    ],
    "totalPrice": {
        "currency": "EUR",
        "totalNetAmount": 20.08,
        "totalGrossAmount": 23.90,
        "totalTaxAmount": 3.82
    },
    "taxAmounts": [
        {
            "taxRatePercentage": 19,
            "taxAmount": 3.82,
            "netAmount": 20.08
        }
    ],
    "taxConditions": {
        "taxType": "gross"
    },
    "paymentConditions": {
        "paymentTermLabel": "10 Tage - 3 %, 30 Tage netto",
        "paymentTermLabelTemplate": "{discountRange} Tage -{discount}, {paymentRange} Tage netto",
        "paymentTermDuration": 30,
        "paymentDiscountConditions": {
            "discountPercentage": 3,
            "discountRange": 10
        }
    },
    "introduction": "Gerne bieten wir Ihnen an:",
    "remark": "Wir freuen uns auf Ihre Auftragserteilung und sichern eine einwandfreie Ausführung zu.",
    "files": {
        "documentFileId": "ebd84e8a-716d-4a20-a76d-21de75a6d3d1"
    },
    "title": "Angebot"
}
GET {resourceurl}/v1/quotations/{id}

Returns the quotation with id value {id}.

Render a Quotation Document (PDF)
This endpoint is deprecated and should no longer be used. Instead, use the quotation file subresource to directly download the document by specifying the id of the quotation.
Sample request

curl https://api.lexware.io/v1/quotations/e9066f04-8cc7-4616-93f8-ac9ecc8479c8/document
-X GET
-H "Authorization: Bearer {accessToken}"
-H "Accept: application/json"
Sample response

{
  "documentFileId": "b26e1d73-19ff-46b1-8929-09d8d73d4167"
}
GET {resourceurl}/v1/quotations/{id}/document

To download the PDF file of a quotation document, you need its documentFileId. This id is usually returned by the quotation resource. However, PDF document file rendering must be triggered separately via this endpoint for quotations created through the API with the status open.

The returned documentFileId can be used to download the quotation PDF document via the Files Endpoint.

For quotations in draft mode, there does not exist a document file in Lexware. Any request attempts are rejected with 406 responses.
Download a Quotation File
GET {resourceurl}/v1/quotations/{id}/file

Sample request to download a quotation file

curl "https://api.lexware.io/v1/quotations/{id}/file"
-X GET
-H "Accept: */*"
-H "Authorization: Bearer {accessToken}"
Returns the file as binary data with HTTP response code 200. The HTTP header fields Content-Type specifies the file type (MIME type) and the Content-Length the size of the file in bytes. A suggested file name is returned in the header Content-Disposition.

For a quotation, only PDF files are supported. As Accept header, */* and application/pdf can be used. Accept headers with wildcards are also supported and will return the default representation.

If the quotation itself does not exist, the request will be rejected with 404 Not Found.

Requests for other media types will generally be rejected with an HTTP status of 406 Not Acceptable.

For quotations in draft mode, there does not exist a document file in Lexware. Any request attempts are rejected with 409 responses.
Deeplink to a Quotation
Quotations can be directly accessed by permanent HTTPS links to either be viewed or to be edited. If a quotation is not allowed to be edited, a redirection to the view page takes place. In case the given id does not exist, a redirection to the main voucher list takes place.

View URL {appbaseurl}/permalink/quotations/view/{id}

Edit URL {appbaseurl}/permalink/quotations/edit/{id}

Recurring Templates Endpoint
Purpose
This endpoint provides read-only access to the templates of recurring invoices, either individually or all as collection. Based on recurring invoice templates, Lexware will create regular invoices in configured intervals. This operation is executed nightly from 3am CET/CEST.

Please note that it is not possible to query all deduced invoices for a given recurring template. However, when GETting an invoice that was deduced from a recurring template, it will include a reference to the respective recurring template. This allows gathering of information such as the next execution date or the execution status.

Recurring Template Properties
The set of properties of recurring templates are almost the same as of regular invoices, however, recurring templates do not have any date values set because these will only be derived when the recurring invoices are created. Additionally, the configuration of recurring invoices is defined in a nested object. Recurring templates always reference an existing contact.

Sample of a recurring template with multiple line items. Fields with no content are displayed with "null" just for demonstration purposes.

{
  "id": "ac1d66a8-6d59-408b-9413-d56b1db7946f",
  "organizationId": "aa93e8a8-2aa3-470b-b914-caad8a255dd8",
  "createdDate": "2023-02-10T09:00:00.000+01:00",
  "updatedDate": "2023-02-10T09:00:00.000+01:00",
  "version": 0,
  "language": "de",
  "archived": false,
  "address": {
    "contactId": "464f4881-7a8c-4dc4-87de-7c6fd9a506b8",
    "name": "Bike & Ride GmbH & Co. KG",
    "supplement": "Gebäude 10",
    "street": "Musterstraße 42",
    "city": "Freiburg",
    "zip": "79112",
    "countryCode": "DE"
  },
  "lineItems": [
    {
      "id": "97b98491-e953-4dc9-97a9-ae437a8052b4",
      "type": "material",
      "name": "Abus Kabelschloss Primo 590 ",
      "description": "· 9,5 mm starkes, smoke-mattes Spiralkabel mit integrierter Halterlösung zur Befestigung am Sattelklemmbolzen · bewährter Qualitäts-Schließzylinder mit praktischem Wendeschlüssel · KabelØ: 9,5 mm, Länge: 150 cm",
      "quantity": 2,
      "unitName": "Stück",
      "unitPrice": {
        "currency": "EUR",
        "netAmount": 13.4,
        "grossAmount": 15.95,
        "taxRatePercentage": 19
      },
      "discountPercentage": 50,
      "lineItemAmount": 13.4
    },
    {
      "id": "dc4c805b-7df1-4310-a548-22be4499eb04",
      "type": "service",
      "name": "Aufwändige Montage",
      "description": "Aufwand für arbeitsintensive Montagetätigkeit",
      "quantity": 1,
      "unitName": "Stunde",
      "unitPrice": {
        "currency": "EUR",
        "netAmount": 8.32,
        "grossAmount": 8.9,
        "taxRatePercentage": 7
      },
      "discountPercentage": 0,
      "lineItemAmount": 8.32
    },
    {
      "id": null,
      "type": "custom",
      "name": "Energieriegel Testpaket",
      "description": null,
      "quantity": 1,
      "unitName": "Stück",
      "unitPrice": {
        "currency": "EUR",
        "netAmount": 5,
        "grossAmount": 5,
        "taxRatePercentage": 0
      },
      "discountPercentage": 0,
      "lineItemAmount": 5
    },
    {
      "type": "text",
      "name": "Freitextposition",
      "description": "This item type can contain either a name or a description or both."
    }
  ],
  "totalPrice": {
    "currency": "EUR",
    "totalNetAmount": 26.72,
    "totalGrossAmount": 29.85,
    "totalTaxAmount": 3.13,
    "totalDiscountAbsolute": null,
    "totalDiscountPercentage": null
  },
  "taxAmounts": [
    {
      "taxRatePercentage": 0,
      "taxAmount": 0,
      "netAmount": 5
    },
    {
      "taxRatePercentage": 7,
      "taxAmount": 0.58,
      "netAmount": 8.32
    },
    {
      "taxRatePercentage": 19,
      "taxAmount": 2.55,
      "netAmount": 13.4
    }
  ],
  "taxConditions": {
    "taxType": "net",
    "taxTypeNote": null
  },
  "paymentConditions": {
    "paymentTermLabel": "10 Tage - 3 %, 30 Tage netto",
    "paymentTermLabelTemplate": "{discountRange} Tage -{discount}, {paymentRange} Tage netto",
    "paymentTermDuration": 30,
    "paymentDiscountConditions": {
      "discountPercentage": 3,
      "discountRange": 10
    }
  },
  "title": "Rechnung",
  "introduction": "Ihre bestellten Positionen stellen wir Ihnen hiermit in Rechnung",
  "remark": "Vielen Dank für Ihren Einkauf",
  "recurringTemplateSettings": {
    "id": "9c5b8bde-7d36-49e8-af5c-4fbe7dc9fa01",
    "startDate": "2023-03-01",
    "endDate": "2023-06-30",
    "finalize": true,
    "shippingType": "service",
    "retroactiveInvoice": false,
    "executionInterval": "MONTHLY",
    "nextExecutionDate": "2023-03-01",
    "lastExecutionFailed": false,
    "lastExecutionErrorMessage": null,
    "executionStatus": "ACTIVE"
  }
}
Compared to invoices, recurring templates do not have a voucherStatus, voucherNumber, voucherDate, dueDate, shippingConditions, and files, as these are only derived or calculated during invoice creation.
                    Property	Description
id
uuid	Unique id generated on creation by Lexware.
Read-only.
organizationId
uuid	Unique id of the organization the recurring template belongs to.
Read-only.
createdDate
dateTime	The instant of time when the invoice was created by Lexware in format yyyy-MM-ddTHH:mm:ss.SSSXXX as described in RFC 3339/ISO 8601 (e.g. 2023-02-21T00:00:00.000+01:00).
Read-only.
updatedDate
dateTime	The instant of time when the invoice was updated by Lexware in format yyyy-MM-ddTHH:mm:ss.SSSXXX as described in RFC 3339/ISO 8601 (e.g. 2023-02-21T00:00:00.000+01:00).
Read-only.
version
integer	Version (revision) number which will be increased on each change to handle optimistic locking.
Read-only.
language
string	Specifies the language of the invoice which affects the print document but also set translated default text modules when no values are send (e.g. for introduction). Values accepted in ISO 639-1 code. Possible values are German de (default) and English en.
address
object	The address of the invoice recipient. For details see below.
lineItems
list	The items of the invoice. For details see below.
totalPrice
object	The total price of the invoice. For details see below.
taxAmounts
list	The tax amounts for each tax rate. Please note: As done with every read-only element or object all submitted content (POST) will be ignored. For details see below.
Read-only.
taxConditions
object	The tax conditions of the invoice. For details see below.
paymentConditions
object	The payment conditions of the invoice. The organization's (or contact-specific) default is used if no value was sent. For details see below.
title
string	(Optional) A title text. The organization's default is used if no value was sent.
introduction
string	(Optional) An introductory text / header. The organization's default is used if no value was sent.
remark
string	(Optional) A closing text note. The organization's default is used if no value was sent.
recurringTemplateSettings
object	The settings for creating recurring template.
Read-only.
Recurring Templates always referencing an existing Lexware contact.
Address Details

                    Property	Description
contactId
uuid	If the recurring-template recipient is (optionally) registered as a contact in Lexware, this field specifies the related id of the contact.
name
string	The name of the recurring-template recipient. To use an existing contact of an individual person, provide the name in the format {firstname} {lastname}.
supplement
string	(Optional) An address supplement.
street
string	The street (street and street number) of the address.
city
string	The city of the address.
zip
string	The zip code of the address.
countryCode
enum	The ISO 3166 alpha2 country code of the address.
contactPerson
string	The contact person selected while editing the voucher. The primary contact person will be used when creating vouchers via the API with a referenced contactId.
Read-only.
Line Items Details

A maximum of 300 line items can be used in a single recurring-template.
For referencing an existing product or service, it is necessary to provide its UUID. However, all required properties must still be specified for the referencing line item. Additionally, the referenced product or service can be modified by adjusting the input. This deviated data will not be stored back to the product/service in Lexware.

                    Property	Description
id
uuid	The field specifies the related id of a referenced product/service.
type
enum	The type of the item. Possible values are service (the line item is related to a supply of services), material (the line item is related to a physical product), custom (an item without reference in Lexware and has no id) or text (contains only a name and/or a description for informative purposes).
name
string	The name of the item.
description
string	The description of the item.
quantity
number	The amount of the purchased item. The value can contain up to 4 decimals.
unitName
string	The unit name of the purchased item. If the provided unit name is not known in Lexware it will be created on the fly.
unitPrice
object	The unit price of the purchased item. For details see below.
discountPercentage
number	The offered discount for the item. The value can contain up to 2 decimals.
lineItemAmount
number	The total price of this line item. Depending by the selected taxType in taxConditions, the amount must be given either as net or gross. The value can contain up to 2 decimals.
Read-only.
Unit Price Details

                    Property	Description
currency
enum	The currency of the price. Currently only EUR is supported.
netAmount
number	The net price of the unit price. The value can contain up to 4 decimals.
grossAmount
number	The gross price of the unit price. The value can contain up to 4 decimals.
taxRatePercentage
number	The tax rate of the unit price. See the "Supported tax rates" FAQ for more information and a list of possible values.. For vat-free sales vouchers the tax rate percentage must be 0.
Total Price Details

                    Property	Description
currency
string	The currency of the total price. Currently only EUR is supported.
totalNetAmount
number	The total net price over all line items. The value can contain up to 2 decimals.
Read-only.
totalGrossAmount
number	The total gross price over all line items. The value can contain up to 2 decimals.
Read-only.
totalTaxAmount
number	The total tax amount over all line items. The value can contain up to 2 decimals.
Read-only.
totalDiscountAbsolute
number	(Optional) A total discount as absolute value. The value can contain up to 2 decimals.
totalDiscountPercentage
number	(Optional) A total discount relative to the gross amount or net amount dependent on the given tax conditions. A contact-specific default will be set if available and no total discount was send. The value can contain up to 2 decimals.
Tax Amounts Details

                    Property	Description
taxRatePercentage
number	Tax rate as percentage value. See the "Supported tax rates" FAQ for more information and a list of possible values..
taxAmount
number	The total tax amount for this tax rate. The value can contain up to 2 decimals.
netAmount
number	The total net amount for this tax rate. The value can contain up to 2 decimals.
Tax Conditions Details

Sample for vat-free tax conditions

"taxConditions": {
    "taxType": "constructionService13b",
    "taxTypeNote": "Steuerschuldnerschaft des Leistungsempfängers (Reverse Charge)"
}
                    Property	Description
taxType
enum	The tax type for the recurring-template. Possible values are net, gross, vatfree (Steuerfrei), intraCommunitySupply (Innergemeinschaftliche Lieferung gem. §13b UStG), constructionService13b (Bauleistungen gem. §13b UStG), externalService13b (Fremdleistungen innerhalb der EU gem. §13b UStG), thirdPartyCountryService (Dienstleistungen an Drittländer), thirdPartyCountryDelivery (Ausfuhrlieferungen an Drittländer), and photovoltaicEquipment (0% taxation for photovoltaic equipment and installations in Germany starting 2023-01, Material und Leistungen für Photovoltaik-Installationen)
taxSubType
enum	A tax subtype. Only required for dedicated cases. For vouchers referencing a B2C customer in the EU, and with a taxType of net or gross, the taxSubType may be set to distanceSales, or electronicServices. Passing a null value results in a standard voucher.
If the organization's distanceSalesPrinciple (profile endpoint) is set to DESTINATION and this attribute is set to distanceSales or electronicServices, the voucher needs to reference the destination country's tax rates.
taxTypeNote
string	When taxType is set to a vat-free tax type then a note regarding the conditions can be set. When omitted Lexware sets the organization's default.
Payment Conditions Details

The payment conditions are optional and the organization's or contact-specific defaults will be used if ommitted.

                    Property	Description
paymentTermLabel
string	A textual note regarding the payment conditions.
paymentTermLabelTemplate
string	A textual note regarding the payment conditions. This label template may contain variables such as the discount range. These variables are enclosed in curly braces, e.g., {discountRange}.'
Read-only.
paymentTermDuration
integer	The time left (in days) until the payment must be conducted.
paymentDiscountConditions
object	The payment discount conditions for the recurring-template.
Payment Discount Conditions Details

                    Property	Description
discountPercentage
number	The discount offered in return for payment within the discountRange. The value can contain up to 2 decimals.
discountRange
integer	The time left (in days) the discount is valid.
Recurring Template Settings Details

                    Property	Description
id
uuid	The id of the recurring template settings.
Read-only.
startDate
date	(Optional) The start date of the first recurring invoice in short iso date yyyy-MM-dd. If null, recurring template is PAUSED.
endDate
date	(Optional) The end date of the first recurring invoice in short iso date yyyy-MM-dd.
finalize
boolean	Specifies the status of the invoice. If false recurring invoices are created as draft (is editable), otherwise they are finalized as open (finalized and no longer editable but yet unpaid or only partially paid). In contrast to the invoice endpoint, finalized recurring invoices will immediately and automatically be sent to the customer via email.
shippingType
enum	The same shipping types defined in the shipping conditions of invoices. Can be either one of: service, serviceperiod, delivery, deliveryperiod, none. The shipping dates/date range will be calculated automatically during execution.
retroactiveInvoice
boolean	Whether the recurring invoice should be created retroactively or not. If true, the first recurring invoice will be created for a date prior to the start date, based on the execution interval. For example, with a monthly execution interval, the invoice will be created one month before the specified start date.
Read-only.
executionInterval
enum	The execution interval defined as WEEKLY, BIWEEKLY, MONTHLY, QUARTERLY, BIANNUALLY, ANNUALLY.
lastExecutionFailed
boolean	Whether the last execution of the recurring template was successful or not.
Read-only.
lastExecutionErrorMessage
string	Describes the problem briefly when the last execution has failed.
Read-only.
executionStatus
enum	The status of the recurring template defined as ACTIVE, PAUSED, ENDED. Note, that there is no error state.
Read-only.



Retrieve a Recurring Template
Sample request

curl https://api.lexware.io/v1/recurring-templates/ac1d66a8-6d59-408b-9413-d56b1db7946f
-X GET
-H "Authorization: Bearer {accessToken}"
-H "Content-Type: application/json"
-H "Accept: application/json"
Sample response

{
    "id": "ac1d66a8-6d59-408b-9413-d56b1db7946f",
    "organizationId": "a3d94eb4-98bc-429e-b7ad-17f1a8463af9",
    "createdDate": "2023-02-10T14:29:03.114+01:00",
    "updatedDate": "2023-02-10T14:29:03.143+01:00",
    "version": 1,
    "language": "de",
    "archived": false,
    "address": {
        "contactId": "df315523-1e92-473a-9d00-052212da84f8",
        "name": "Haufe-Lexware GmbH & Co. KG",
        "street": "Munzingerstraße 8",
        "city": "Freiburg",
        "zip": "79111",
        "countryCode": "DE"
    },
    "lineItems": [
        {
            "type": "custom",
            "name": "Schulung",
            "quantity": 6,
            "unitName": "Stunde",
            "unitPrice": {
                "currency": "EUR",
                "netAmount": 100.84,
                "grossAmount": 120,
                "taxRatePercentage": 19
            },
            "discountPercentage": 0,
            "lineItemAmount": 720.00
        }
    ],
    "totalPrice": {
        "currency": "EUR",
        "totalNetAmount": 605.04,
        "totalGrossAmount": 720,
        "totalTaxAmount": 114.96
    },
    "taxAmounts": [
        {
            "taxRatePercentage": 19,
            "taxAmount": 114.96,
            "netAmount": 605.04
        }
    ],
    "taxConditions": {
        "taxType": "gross"
    },
    "paymentConditions": {
        "paymentTermLabel": "Zahlbar sofort, rein netto",
        "paymentTermLabelTemplate": "Zahlbar sofort, rein netto",
        "paymentTermDuration": 0
    },
    "introduction": "Unsere Lieferungen/Leistungen stellen wir Ihnen wie folgt in Rechnung.",
    "remark": "Vielen Dank für die gute Zusammenarbeit.",
    "title": "Rechnung",
    "recurringTemplateSettings": {
        ....
    }
}
GET {resourceurl}/v1/recurring-templates/{id}

Returns the recurring template with id value {id}.

Retrieve all Recurring Templates
Sample request

curl https://api.lexware.io/v1/recurring-templates?page=0&size=25&sort=createdDate,DESC
-X GET
-H "Authorization: Bearer {accessToken}"
-H "Accept: application/json"
Sample response

{
    "content": [
        {
            "id": "cab021e5-91d3-4e93-a696-56b7f2417547",
            "organizationId": "a3d94eb4-98bc-429e-b7ad-17f1a8463af9",
            "title": "Rechnung",
            "createdDate": "2023-02-10T14:35:40.642+01:00",
            "updatedDate": "2023-02-10T14:36:49.741+01:00",
            "address": {
                "contactId": "464f4881-7a8c-4dc4-87de-7c6fd9a506b8",
                "name": "Bike & Ride GmbH & Co. KG"
            },
            "totalPrice": {
                "currency": "EUR",
                "totalNetAmount": 251.26,
                "totalGrossAmount": 299
            },
            "paymentConditions": {
                "paymentTermLabel": "10 Tage abzüglich 2 % Skonto",
                "paymentTermLabelTemplate": "{paymentRange} Tage abzüglich {discount} Skonto",
                "paymentTermDuration": 10,
                "paymentDiscountConditions": {
                    "discountPercentage": 2,
                    "discountRange": 10
                }
            },
            "recurringTemplateSettings": {
                "id": "615a8db3-bce1-4e11-8302-328fcbacd613",
                "startDate": "2023-04-01",
                "endDate": "2024-04-01",
                "finalize": false,
                "shippingType": "serviceperiod",
                "retroactiveInvoice": false,
                "executionInterval": "QUARTERLY",
                "lastExecutionFailed": false,
                "executionStatus": "PAUSED"
            }
        },
        {
            "id": "ac1d66a8-6d59-408b-9413-d56b1db7946f",
            "organizationId": "a3d94eb4-98bc-429e-b7ad-17f1a8463af9",
            "title": "Rechnung",
            "createdDate": "2023-02-10T14:29:03.114+01:00",
            "updatedDate": "2023-02-10T14:29:03.143+01:00",
            "address": {
                "contactId": "df315523-1e92-473a-9d00-052212da84f8",
                "name": "Haufe-Lexware GmbH & Co. KG"
            },
            "totalPrice": {
                "currency": "EUR",
                "totalNetAmount": 605.04,
                "totalGrossAmount": 720
            },
            "paymentConditions": {
                "paymentTermLabel": "Zahlbar sofort, rein netto",
                "paymentTermLabelTemplate": "Zahlbar sofort, rein netto",
                "paymentTermDuration": 0
            },
            "recurringTemplateSettings": {
                "id": "9c5b8bde-7d36-49e8-af5c-4fbe7dc9fa01",
                "startDate": "2023-03-01",
                "endDate": "2023-06-30",
                "finalize": true,
                "shippingType": "service",
                "retroactiveInvoice": false,
                "executionInterval": "MONTHLY",
                "nextExecutionDate": "2023-03-01",
                "lastExecutionFailed": false,
                "executionStatus": "ACTIVE"
            }
        }
    ],
    "first": true,
    "last": true,
    "totalPages": 1,
    "totalElements": 2,
    "numberOfElements": 2,
    "size": 25,
    "number": 0,
    "sort": [
        {
            "property": "createdDate",
            "direction": "DESC",
            "ignoreCase": false,
            "nullHandling": "NATIVE",
            "ascending": false
        }
    ]
}
GET {resourceurl}/v1/recurring-templates[?{paging}{&sorting}]

Retrieve a collection of recurring templates. The result returns only part of the most relevant data which are the referenced contact (only id and name), total price, payment conditions and the complete recurring templates settings. The naming of objects and properties are the same, though.

Paging Parameters

The collection of recurring templates is a paged list. This parameter changes the used page size:

                    Parameter Name	Description
size	Default page size is 25. Can be set up to a maximum of 250.
page	Page to retrieve. 0-based value. If not given, the first page (index 0) is returned.
For further information see Paging of Resources

Sorting Parameters

The collection of recurring templates can be sorted using the following parameter:

                    Parameter Name	Description
sort	Property to sort result content by. Possible values are createdDate, updatedDate, lastExecutionDate or nextExecutionDate. The sort direction can be added separated by a comma. Possible values for the direction are ASC or DESC (default is updatedDate,DESC).
Retrieving the next recurring invoice to be executed

The next recurring template to be executed can be retrieved by using paging and sorting.

GET {resourceurl}/v1/recurring-templates?page=0&size=1&sort=nextExecutionDate,ASC

Deeplink to a Recurring Template
Recurring templates can be directly accessed by permanent HTTPS links for viewing or editing. In case the given id does not exist, a redirection to the main voucher list takes place.

(There is no separate view page for recurring templates)

Edit URL {appbaseurl}/permalink/recurring-templates/edit/{id}

Voucherlist Endpoint
Purpose
The voucherlist endpoint provides read access to meta data of (bookkeeping) vouchers (e.g. salesinvoices, salescreditnotes), invoices (including down payment invoices), credit notes, order confirmations, quotations, and delivery notes. Details concerning items from the list are accessible by id using the respective endpoint. For more information on the different voucher types refer to the documentation on the respective endpoints. The voucherlist can be searched using various filters to get only the data you need.

Voucherlist Properties
This section describes the properties of the meta data object for vouchers returned by this endpoint.

                    Property	Description
id
uuid	Unique id of the voucher in Lexware.
voucherType
enum	Type of the voucher. Possible values are salesinvoice, salescreditnote, purchaseinvoice, purchasecreditnote, invoice, downpaymentinvoice, creditnote, orderconfirmation, quotation, and deliverynote.
voucherStatus
enum	Showing the current workflow status of the voucher in Lexware. Possible values are draft, open, paid, paidoff, voided, transferred, sepadebit, overdue, accepted, rejected, and unchecked.
voucherNumber
string	Identification/Reference number of the voucher.
voucherDate
dateTime	Date when the voucher was issued. Value in format yyyy-MM-ddTHH:mm:ss.SSSXXX as described in RFC 3339/ISO 8601 (e.g. 2023-02-21T00:00:00.000+01:00).
createdDate
dateTime	Date when the voucher was created in Lexware. Value in format yyyy-MM-ddTHH:mm:ss.SSSXXX as described in RFC 3339/ISO 8601 (e.g. 2023-02-21T00:00:00.000+01:00).
updatedDate
dateTime	Date when the voucher was last changed (or status changed) in Lexware. Value in format yyyy-MM-ddTHH:mm:ss.SSSXXX as described in RFC 3339/ISO 8601 (e.g. 2023-02-21T00:00:00.000+01:00).
dueDate
dateTime	Date when the voucher's payment has to be settled. Value in format yyyy-MM-ddTHH:mm:ss.SSSXXX as described in RFC 3339/ISO 8601 (e.g. 2023-02-21T00:00:00.000+01:00).
contactId
uuid	The id of an existing contact in Lexware which is the recipient or invoicing party. Will be null for the Collective Contact.
contactName
string	Name of the recipient or invoicing party.
totalAmount
number	Total amount of the voucher (may include taxes). Format is ##.00 (119.00).
openAmount
number	Open amount of the voucher. May be null (e.g., for invoices in draft, or various non-invoice vouchers). Format is ##.00 (123.00).
currency
enum	Currency of the voucher. Only possible value is EUR.
archived
boolean	Indicates if the voucher is marked as archived in Lexware.
Retrieve and Filter Voucherlist
Vouchers can be filtered by various attributes, such as voucherType, voucherStatus, the archived flag, various relevant dates, and the voucher number.

To check the maximum page size for this endpoint, see Paging of Resources.

Sample request

curl https://api.lexware.io/v1/voucherlist?voucherType=purchaseinvoice,invoice&voucherStatus=open&voucherDateFrom=2023-03-01
-X GET
-H "Authorization: Bearer {accessToken}"
-H "Accept: application/json"
Sample Response

{
    "content": [
        {
            "id": "57b8d457-1fb6-4ae9-944a-9fe763da2aff",
            "voucherType": "purchaseinvoice",
            "voucherStatus": "open",
            "voucherNumber": "2010096",
            "voucherDate": "2023-06-14T00:00:00.000+02:00",
            "createdDate": "2023-03-22T12:36:22.000+01:00",
            "updatedDate": "2023-03-22T12:36:22.000+01:00",
            "dueDate": "2023-06-21T00:00:00.000+02:00",
            "contactId": null,
            "contactName": "Sammellieferant",
            "totalAmount": 80.04,
            "openAmount": 80.04,
            "currency": "EUR",
            "archived": false
        },
        {
            "id": "f3d3ae48-30d9-4b56-973a-b3159cbe743c",
            "voucherType": "invoice",
            "voucherStatus": "open",
            "voucherNumber": "RE1012",
            "voucherDate": "2023-05-14T00:00:00.000+02:00",
            "createdDate": "2023-05-14T16:52:21.000+02:00",
            "updatedDate": "2023-05-14T16:52:21.000+02:00",
            "dueDate": "2023-05-24T00:00:00.000+02:00",
            "contactId": "777c7793-9fbb-4ec7-9254-0619c199761e",
            "contactName": "Musterfrau, Erika",
            "totalAmount": 99.8,
            "openAmount": 74.8,
            "currency": "EUR",
            "archived": false
        },
        {
            "id": "55aa6de8-d32d-47bd-9c3c-d541ab65a8e8",
            "voucherType": "invoice",
            "voucherStatus": "overdue",
            "voucherNumber": "RE1011",
            "voucherDate": "2023-03-02T00:00:00.000+01:00",
            "createdDate": "2023-03-03T16:52:21.000+01:00",
            "updatedDate": "2023-03-03T16:52:21.000+01:00",
            "dueDate": "2023-10-06T00:00:00.000+02:00",
            "contactId": "b08a1ac7-10fc-4214-b875-8491f91479dd",
            "contactName": "Test GmbH",
            "totalAmount": 498.8,
            "openAmount": 498.8,
            "currency": "EUR",
            "archived": false
        }
    ],
    "first": true,
    "last": true,
    "totalPages": 1,
    "totalElements": 3,
    "numberOfElements": 3,
    "size": 25,
    "number": 0,
    "sort": [
        {
            "property": "voucherdate",
            "direction": "DESC",
            "ignoreCase": false,
            "nullHandling": "NATIVE",
            "ascending": false
        }
    ]
}
GET {resourceurl}/v1/voucherlist?{voucherType}&{voucherStatus}[&filter_1=value_1...&filter_n=value_n]

Returns a page of meta data for all vouchers matching the given filter parameters. Filters voucherType and status voucherStatus are mandatory, all other parameters are optional.

Filter Parameters

Parameter Name	required	Description
voucherType
string	yes	A comma-separated list of voucher types to be returned, or the value "any". For more details on this parameter, see below.
voucherStatus
string	yes	A comma-separated list of voucher status, or the value "any". Some status only apply to specific voucher types. For more details on this parameter, see below.
archived
boolean	no	If the voucher is marked as archived or not.
contactId
uuid	no	The id of an existing Lexware contact.
voucherDateFrom
date	no	The date of the voucher in format yyyy-MM-dd(e.g. 2023-06-01). References a full day in CET/CEST 0:00-23:59:59
voucherDateTo
date	no	The date of the voucher in format yyyy-MM-dd(e.g. 2023-06-30). References a full day in CET/CEST 0:00-23:59:59
createdDateFrom
date	no	The date the voucher was created in format yyyy-MM-dd(e.g. 2023-06-01). References a full day in CET/CEST 0:00-23:59:59
createdDateTo
date	no	The date the voucher was created in format yyyy-MM-dd(e.g. 2023-06-30). References a full day in CET/CEST 0:00-23:59:59
updatedDateFrom
date	no	The date the voucher was lastly modified in format yyyy-MM-dd(e.g. 2023-06-01). References a full day in CET/CEST 0:00-23:59:59
updatedDateTo
date	no	The date the voucher was lastly modified in format yyyy-MM-dd(e.g. 2023-06-30). References a full day in CET/CEST 0:00-23:59:59
voucherNumber
string	no	The voucher's voucher number
The values of all mentioned properties have to be URL encoded when used to send data to Lexware. See this FAQ for more information.
Paging Parameters

The voucherlist is a paged list. This parameter changes the used page size:

                    Parameter Name	Description
size
integer	Default page size is 25. Can be set up to a maximum of 250.
page
integer	Page to retrieve. 0-based value. If not given, the first page (index 0) is returned.
For further information see Paging of Resources

Sorting Parameters

The voucherlist can be sorted using the following parameter:

                    Parameter Name	Description
sort
string	Property significant to order of the contents. Possible values are voucherDate, voucherNumber, createdDate and updatedDate. The sort direction can be added separated by a comma. Possible values for the direction are ASC or DESC.
Filter Parameter voucherType

This filter parameter is required. It can contain a comma separated list of voucher types, or the value "any". In the latter case, all voucher types currently available in Lexware will be returned. Please note that new voucher types may be introduced in the future. Make sure that your application will be able to handle newly added types.

Full information on any voucher can be retrieved by calling the endpoint related to the meta data object's voucherType. Please refer to this list for information on which endpoint you should call.

                    Voucher Type	Endpoint
salesinvoice	Vouchers Endpoint
salescreditnote	Vouchers Endpoint
purchaseinvoice	Vouchers Endpoint
purchasecreditnote	Vouchers Endpoint
invoice	Invoices endpoint
creditnote	Credit Notes endpoint
orderconfirmation	Order Confirmations Endpoint
quotation	Quotations Endpoint
downpaymentinvoice	Down Payment Invoice Endpoint
deliverynote	Delivery Notes Endpoint
Filter Parameter voucherStatus

This filter parameter is required. It can contain a comma separated list of voucher status, or the value "any". In the latter case, all voucher states currently available in Lexware will be returned. Please note that new voucher states might be introduced in the future. Make sure that your application will be able to handle this.

The status overdue can not be filtered in combination with other status filters.
Since status overdue is a transient status, it can also be returned when filtered for vouchers with status open or sepadebit where the voucher's duedate is in the past.
                    Voucher Status	Description
draft	Voucher is created but not yet final. It is still editable in Lexware.
open	Voucher is finalized in Lexware and no longer editable but yet unpaid or only partially paid.
overdue	Voucher is open/sepadebit and dueDate is in the past.
paid	Voucher is marked as fully paid in Lexware.
paidoff	Voucher is a credit note and paid in full.
voided	Voucher is cancelled.
transferred	Voucher is transferred via the Lexware online banking connector. When the payment is handled by the bank this status changes to paid.
sepadebit	The payment has already been authorized or the amount will be collected by direct debit (direct withdrawal). When the payment is handled by the bank this status changes to paid.
accepted	Only used for quotations. This status is set when a quotation was marked as accepted in Lexware.
rejected	Only used for quotations. This status is set when a quotation was marked as rejected in Lexware.
unchecked	Only used for bookkeeping vouchers. The voucher has been created in Lexware using a file upload, but lacks mandatory information and cannot yet be booked
Vouchers Endpoint
Purpose
The voucher endpoint provides read/write access to (bookkeeping) vouchers (e.g. invoices, creditnotes).

In contrast to sales vouchers such as invoices that were created with Lexware containing information such as item positions, stocks, etc., bookkeeping vouchers are containers for bookkeeping data such as creditor/debitor association and positions grouped by tax rate. Normally, a file (pdf or image) is added to the voucher as a receipt which was created by and received from an external system.

A higher level description of the handling of vouchers via the Lexware API can be found in the bookkeeping cookbook (German only).

Voucher Properties
Sample of a voucher having multiple vouchers items with different tax rates and using the collective contact

{
    "id": "a8691b5d-2393-4317-888d-bcd5d564f7d1",
    "organizationId": "aa93e8a8-2aa3-470b-b914-caad8a255dd8",
    "type": "salesinvoice",
    "voucherStatus": "open",
    "voucherNumber": "2023-000321",
    "voucherDate": "2023-06-30T00:00:00.000+02:00",
    "shippingDate": "2023-07-02T00:00:00.000+02:00",
    "dueDate": "2023-07-07T00:00:00.000+02:00",
    "totalGrossAmount": 326.00,
    "totalTaxAmount": 26.00,
    "taxType": "gross",
    "useCollectiveContact": true,
    "remark": "Bestellung von Max Mustermann.",
    "voucherItems": [
        {
            "amount": 119.00,
            "taxAmount": 19.00,
            "taxRatePercent": 19.00,
            "categoryId": "8f8664a8-fd86-11e1-a21f-0800200c9a66"
        },
        {
            "amount": 107.00,
            "taxAmount": 7.00,
            "taxRatePercent": 7.00,
            "categoryId": "8f8664a8-fd86-11e1-a21f-0800200c9a66"
        },
        {
            "amount": 100.00,
            "taxAmount": 0,
            "taxRatePercent": 0.00,
            "categoryId": "8f8664a8-fd86-11e1-a21f-0800200c9a66"
        }
    ],
    "files": [],
    "createdDate": "2023-06-30T13:28:51.012+02:00",
    "updatedDate": "2023-06-30T13:28:51.012+02:00",
    "version": 2
}
                    Property	Description
id
uuid	Unique id of the voucher generated on creation by Lexware.
organizationId
uuid	Unique id of the organization the voucher was generated on.
type
enum	Type of the voucher. Possible values are salesinvoice (e.g. for sales orders), salescreditnote (e.g. for refunds or returned sales orders), purchaseinvoice and purchasecreditnote. Note that the same categoryId can be used for salescreditnotes and for salesinvoices.
voucherStatus
enum	Billing state of the voucher. Possible values are open, paid, paidoff, voided, transferred, sepadebit, or unchecked.
Only open and unchecked are writeable leveraging the Lexware API
voucherNumber
string	Number of the voucher. Should be the order's identification/reference number.
voucherDate
date	Date when the voucher was issued. Format must be yyyy-MM-dd (e.g. 2023-06-28).
shippingDate
date	Date when the purchased item/service has to be shipped/supplied. If it is a period of time, the end date must be given. Format must be yyyy-MM-dd (e.g. 2023-07-02). Please note: ShippingDate can only be specified for voucher types salesinvoice and salescreditnote.
dueDate
date	Date when the voucher's payment has to be settled. Format must be yyyy-MM-dd (e.g. 2023-06-28).
totalGrossAmount
number	Total gross amount of the voucher. Must match the sum of all positions with added/calculated tax amounts. Format must be ##.00 (119.00).
totalTaxAmount
number	Total tax amount of the voucher. Must match the sum of all positions' tax amounts. Format must be ##.00 (19.00).
taxType
enum	Tax type of the order. Possible values are net (position amounts will be provided net, taxes have to be added), gross (position amounts will be provided gross, tax is already included). See below for information about limitations of net vouchers.
useCollectiveContact
boolean	Set to true if the Collective Contact (customer/vendor) within Lexware should be used. If used, the optional contactId will be ignored.
contactName
string	Name of the recipient or invoicing party if the collective contact is used. Please note that if you change the contact name, the voucher will have an individual contact name but is still assigned to the collective contact. Also, changing the contact name does not result in the name of the collective contact being changed.
contactId
uuid	If not using the collective contact option, an existing contact id must be provided. This must exist within Lexware before and can be created via the Contacts endpoint. If a contact is assigned to a voucher, its role must either be Customer, or both Customer and Vendor.
remark
string	Any comments or remarks to the order. This field is part of the full text search of Lexware, any information for finding the voucher can be placed here as convenience of the Lexware user.
voucherItems
list	Positions of the voucher grouped by tax rate. The specification of voucherItems objects can be found below.
files
list	A list of voucher image file uuids assigned to the voucher. Voucher images can be uploaded using the sub-resource endpoint Upload a File to a Voucher. Please note: Each file (voucher image) can only be assigned once, and omitting existing file ids during updates will delete the files permanently.
createdDate
dateTime	The instant of time when the voucher was created by Lexware in format yyyy-MM-ddTHH:mm:ss.SSSXXX as described in RFC 3339/ISO 8601 (e.g. 2023-02-21T00:00:00.000+01:00).
Read-only.
updatedDate
dateTime	The instant of time when the voucher was updated by Lexware in format yyyy-MM-ddTHH:mm:ss.SSSXXX as described in RFC 3339/ISO 8601 (e.g. 2023-02-21T00:00:00.000+01:00).
Read-only.
version
integer	Version (revision) number which will be increased on each change to handle optimistic locking. Set to 0 for initial POST, for PUT get latest version from Lexware (via GET) and merge with your changes. Please note: If the version did not match the version stored in your system, the user must be informed about losing changes from Lexware.
Object voucherItems Details

                    Property	Description
amount
number	Amount of the position. Net or gross amount, according to the voucher's taxType. Format must be ##.00 (119.00).
taxAmount
number	Tax amount of the voucher's item. Format must be ##.00 (19.00).
taxRatePercent
number	Tax rate as percentage value. See the "Supported tax rates" FAQ for more information and a list of possible values. (e.g. 19).
categoryId
uuid	Booking category for this voucher's revenue or expenditure. Supported and appropriate categoryId's can be found here.
Create a Voucher
Sample request

curl https://api.lexware.io/v1/vouchers
-X POST
-H "Authorization: Bearer {accessToken}"
-H "Content-Type: application/json"
-H "Accept: application/json"
-d '
{
  "type": "salesinvoice",
  "voucherNumber": "123-456",
  "voucherDate": "2023-06-28",
  "shippingDate": "2023-07-02",
  "dueDate": "2023-07-05",
  "totalGrossAmount": 119.00,
  "totalTaxAmount": 19.00,
  "taxType": "gross",
  "useCollectiveContact": true,
  "remark": "Bestellung von Max Mustermann.",
  "voucherItems": [{
    "amount": 119.00,
    "taxAmount": 19.00,
    "taxRatePercent": 19,
    "categoryId": "8f8664a8-fd86-11e1-a21f-0800200c9a66"
    }]
}'
Sample response

{
  "id": "66196c43-baf3-4335-bfee-d610367059db",
  "resourceUri": "https://api.lexware.io/v1/vouchers/66196c43-baf3-4335-bfee-d610367059db",
  "createdDate": "2023-06-29T15:15:09.447+02:00",
  "updatedDate": "2023-06-29T15:15:09.447+02:00",
  "version": 1
}
POST {resourceurl}/v1/vouchers

The contents of the voucher are expected in the request's body as an application/json. The contents of the voucher must not contain read-only fields.

The created voucher will be shown in the main voucher list in Lexware: https://app.lexware.de/vouchers.

To provide your end-users access to the created voucher, please use our deeplink function.

Description of required properties when creating a voucher.

                    Property	Required	Notes
type	Yes	
voucherStatus	No	Has to be set to unchecked for unchecked vouchers; assumed to be open when left empty. Other values than null, open, and unchecked are rejected.
voucherNumber	*	Optional for status unchecked, mandatory otherwise.
voucherDate	*	Optional for status unchecked, mandatory otherwise.
shippingDate	No	
dueDate	No	If not specified then the voucherDate will also be used for dueDate (unless the voucherStatus is unchecked, in which case the dueDate will remain unset);
totalGrossAmount	*	Optional for status unchecked, mandatory otherwise.
totalTaxAmount	*	Optional for status unchecked, mandatory otherwise.
taxType	Yes	
useCollectiveContact	*	Set to true if the Collective Contact (customer/vendor) within Lexware should be used. If used, the optional contactId will be ignored.
contactId	*	If not using the collective contact option, an existing contact id must be provided.
voucherItems	*	List of nested objects. The required properties of the voucherItems object are listed below. Optional for status unchecked, mandatory otherwise.
version	No	Required for PUT operations, optional for POST; if included in POST payload, the value has to be 1.
Object voucherItems Details

                    Property	Required	Notes
amount	Yes	
taxAmount	Yes	
taxRatePercent	Yes	
categoryId	Yes	
Retrieve a Voucher
Sample request

curl  https://api.lexware.io/v1/vouchers/0a739052-ce80-4ae6-a276-34524eec43b1
-X GET
-H "Authorization: Bearer {accessToken}"
-H "Accept: application/json"
Sample Response

{
  "id": "66196c43-baf3-4335-bfee-d610367059db",
  "organizationId": "aa93e8a8-2aa3-470b-b914-caad8a255dd8",
  "type": "salesinvoice",
  "voucherStatus": "open",
  "voucherNumber": "123-456",
  "voucherDate": "2023-06-28T00:00:00.000+02:00",
  "shippingDate": "2023-07-02T00:00:00.000+02:00",
  "dueDate": "2023-07-05T00:00:00.000+02:00",
  "totalGrossAmount": 119,
  "totalTaxAmount": 19.00,
  "taxType": "gross",
  "useCollectiveContact": true,
  "remark": "Bestellung von Max Mustermann.",
  "voucherItems": [
    {
      "amount": 119,
      "taxAmount": 19.00,
      "taxRatePercent": 19,
      "categoryId": "8f8664a8-fd86-11e1-a21f-0800200c9a66"
    }
  ],
  "files": [],
  "createdDate": "2023-06-29T15:15:09.447+02:00",
  "updatedDate": "2023-06-29T15:15:09.447+02:00",
  "version": 1
}
GET {resourceurl}/v1/vouchers/{id}

Returns the voucher with id value {id}.

Update a Voucher
PUT {resourceurl}/v1/vouchers/{id}.

When you have retrieved a voucher via GET that is identified by {id}, it's possible to update or merge it with the latest information of the requesting system, so that e. g. read-only fields will be filled with the latest Lexware information - e.g. id, organizationId and version.

Although the voucherStatus attribute reflects the voucher's current (billing) status, it is not possible to change that state using the API, except for the finalization of a voucher from unchecked to open.

If the transmitted version of the addressed resource does not match with the current version in Lexware, the HTTP status code 409 (Conflict) is returned. As a consequence the client has to refresh the entity by calling a GET on the resource again to resolve the conflict.
Required properties are the same as described in the Create a Voucher section.

Filtering Vouchers
It's possible to filter vouchers by voucherNumber.

To check the maximum page size for this endpoint, see Paging of Resources.

This filter endpoint is deprecated and should not be used. Please filter vouchers by accessing the voucherlist endpoint instead.
Sample request

curl https://api.lexware.io/v1/vouchers?voucherNumber=123-456-789
-X GET
-H "Authorization: Bearer {accessToken}"
-H "Accept: application/json"
Sample Response

{
  "content": [
    {
      "id": "dba9418a-2381-48cd-afa3-81c0c1d0e53e",
      "organizationId": "aa93e8a8-2aa3-470b-b914-caad8a255dd8",
      "type": "purchaseinvoice",
      "voucherNumber": "123-456-789",
      "voucherDate": "2023-01-31T00:00:00.000+01:00",
      "dueDate": "2023-01-31T00:00:00.000+01:00",
      "totalGrossAmount": 1000,
      "totalTaxAmount": 159.66,
      "taxType": "gross",
      "useCollectiveContact": true,
      "remark": "Test",
      "voucherItems": [
        {
          "amount": 1000,
          "taxAmount": 159.66,
          "taxRatePercent": 19,
          "categoryId": "16d04a28-fd91-11e1-a21f-0800200c9a66"
        }
      ],
      "files": [],
      "createdDate": "2023-01-16T07:58:21.849+01:00",
      "updatedDate": "2023-01-16T07:58:21.849+01:00",
      "version": 0
    },
    {
      "id": "0a739052-ce80-4ae6-a276-34524eec43b1",
      "organizationId": "aa93e8a8-2aa3-470b-b914-caad8a255dd8",
      "type": "salesinvoice",
      "voucherNumber": "123-456-789",
      "voucherDate": "2023-01-31T00:00:00.000+01:00",
      "dueDate": "2023-01-31T00:00:00.000+01:00",
      "totalGrossAmount": 500,
      "totalTaxAmount": 79.83,
      "taxType": "gross",
      "useCollectiveContact": true,
      "remark": "Test-2",
      "voucherItems": [
        {
          "amount": 500,
          "taxAmount": 79.83,
          "taxRatePercent": 19,
          "categoryId": "4f01e761-d912-441f-ad1a-1c1d2d590a81"
        }
      ],
      "files": [],
      "createdDate": "2023-01-16T07:59:32.277+01:00",
      "updatedDate": "2023-01-16T07:59:32.277+01:00",
      "version": 0
    }
  ],
  "totalPages": 1,
  "totalElements": 2,
  "last": true,
  "numberOfElements": 2,
  "first": true,
  "size": 25,
  "number": 0
}
GET {resourceurl}/v1/vouchers?voucherNumber={voucherNumberValue}.

Returns a page with all vouchers where voucherNumber equals a particular value.

The values of all mentioned properties have to be URL encoded when used to send data to Lexware. See this FAQ for more information.
Deeplink to a Voucher
Vouchers of type salesinvoice, salescreditnote, purchaseinvoice and purchasecreditnote can be directly accessed by permanent HTTPS links to either be viewed or to be edited. If a voucher is not allowed to be edited, a redirection to the view page takes place. In case the given voucherId does not exist, a redirection to the main voucher list takes place.

View URL {appbaseurl}/permalink/vouchers/view/{voucherId}

Edit URL {appbaseurl}/permalink/vouchers/edit/{voucherId}

Upload a File to a Voucher
Sample request Upload a File to a Voucher

curl https://api.lexware.io/v1/vouchers/0a739052-ce80-4ae6-a276-34524eec43b1/files
-X POST
-H "Authorization: Bearer {accessToken}"
-H "Content-Type: multipart/form-data"
-H "Accept: application/json"
-F "file=@{PathToImage}"
POST {resourceurl}/v1/vouchers/{id}/files

Upload and assign files (pdf, image, or xml) to the voucher identified by {id}.

Please use this endpoint in case a file upload should be assigned to an existing voucher.
The content of the file will be stored in the body of the request. See also files for details about the required headers. If needed, the file upload status can be retrieved via the files/{id}/status endpoint.

For each uploaded file we calculate a checksum from the file content. If there already exists the same file (due to the checksum) in the given context, then the file id of the existing file is returned and the upload file will be discarded.
To remove files from a voucher, simply update the voucher and omit the file ids you want to remove. Removed files will be finally deleted in Lexware.

List of CategoryIds
CategoryId's for vouchers of type salesinvoice and salescreditnote

The following list of categoryIds is not complete. Please use the posting-categories endpoint in order to retrieve all supported categories in Lexware.
Booking category	categoryId
Warenverkäufe	8f8664a8-fd86-11e1-a21f-0800200c9a66
Dienstleistungen	8f8664a0-fd86-11e1-a21f-0800200c9a66
Einnahmen	8f8664a1-fd86-11e1-a21f-0800200c9a66
Innergemeinschaftliche Lieferung	9075a4e3-66de-4795-a016-3889feca0d20
Fremdleistungen §13b	380a20cb-d04c-426e-b49c-84c22adfa362
Ausfuhrlieferungen an Drittländer	93d24c20-ea84-424e-a731-5e1b78d1e6a9
Dienstleistungen an Drittländer	ef5b1a6e-f690-4004-9a19-91276348894f
Einnahmen als Kleinunternehmer	7a1efa0e-6283-4cbf-9583-8e88d3ba5960
CategoryId's for distance sales

Sales invoices to B2C customers in EU countries require the usage of the following CategoryIds. Please note that, depending on the provided products or services, posting to the categories above may be technically possible, but still be incorrect and possibly illegal in the accounting.

If the organization's distanceSalesPrinciple (see profile endpoint) is set to ORIGIN, the first two categories must be used; if it is set to DESTINATION, the latter pair of categories have to be used. Please note that you also need to reference the destination country's tax rates in that case.

Booking category	categoryId
Fernverkauf	7c112b66-0565-479c-bc18-5845e080880a
Elektronische Dienstleistungen	d73b880f-c24a-41ea-a862-18d90e1c3d82
Fernverkauf in EU-Land steuerpflichtig	4ebd965a-7126-416c-9d8c-a5c9366ee473
Elektronische Dienstleistung in EU-Land steuerpflichtig	7ecea006-844c-4c98-a02d-aa3142640dd5
Limitations of net vouchers
Lexware does not consistently support vouchers that combine the taxType net with the voucherStatus set to unchecked. The API prohibits the creation of unchecked net vouchers.

To tackle this issue, you have the following options:

Finalize the data of the voucher, and create it with voucherStatus set to open
Transmit vouchers as gross vouchers by adding the respective tax amounts to all voucher items and setting the voucher's taxType to gross
Paging of Resources
Sample request

curl https://api.lexware.io/v1/contacts?page=0
-X GET
-H "Authorization: Bearer {accessToken}"
-H "Accept: application/json"
Sample Response

{
  "content":[
    ...
  ],
  "first": true,
  "last": true,
  "totalPages": 1,
  "totalElements": 13,
  "numberOfElements": 13,
  "size": 25,
  "number": 0,
  "sort": [
      {
        "direction": "ASC",
        "property": "name",
        "ignoreCase": false,
        "nullHandling": "NATIVE",
        "ascending": true
      }
  ]
}
The Lexware API supports basic paging of some of its resources. This section outlines the general paging mechanism used in the API. For further details, please refer to the specific endpoints. Note that each paged resource has its own predefined sorting.

For paged resources such as the voucher list, there is a technical limit to the number of entries that can be retrieved, which is currently set to 10,000 entries. If this limit is exceeded, you will encounter the error message Maximum search window size exceeded. To avoid this, please narrow down the date range or other search criteria to ensure the number of entries stays below the maximum threshold.
Paging Parameters and their names

                 Parameter	Name	Description
page
integer	Page	Pages are zero indexed, thus providing 0 for page will return the first page.
size
integer	Size	Default page size is set to 25 but can be increased up to 100/250 (depends on the used endpoint, see table below).
sort
string	Sort	The default sorting and possible options depends on the used endpoint. Some resources cannot be alternatively sorted (e.g. contacts).
Description of the paging information.

                    Property	Description
content
complex	The content of the current page as a JSON array.
first
boolean	Whether the current page is the first one.
last
boolean	Whether the current page is the last one.
totalPages
integer	The total number of pages matching the search criteria.
totalElements
integer	The total number of elements matching the search criteria, up to a maximum of 10,000 entries.
numberOfElements
integer	The number of elements in the current page.
size
integer	The size of the current page.
number
integer	The index of the current page, starting from zero.
sort
list	Information on how the content is sorted.
Maximum Page Size per Endpoint

Endpoint	Page Size Limit
articles	250
contacts	250
recurring-templates	250
voucherlist	250
vouchers	250
Optimistic Locking
Resource modification with PUT requests in the Lexware API requires passing a version property, also known as a revision. This is required to mitigate the risk of overwriting data in a data race condition due to concurrent access of the API.

The Lexware API implements a paradigm known as optimistic locking. That means: an entity (or resource) is not required to be locked before modification, but passing the correct version is required to make sure that no other request has modified the respective entity in the time between the last GET request and the modifying PUT request.

If, for example, a contact is about to be modified, first GET the respective contact, and then include the version you received in your next PUT request. If the record has been modified by someone else in the meantime, you will receive an HTTP status 409 Conflict (see below).

For versioned resources, in the initial POST request, the version needs to have the value of 0.

HTTP Status Codes
The following list shows a brief description of the available HTTP status codes and their meaning in context of the Lexware API.

                    Response code	Description
200
OK	Standard response for a successful request. Depending on the verb (POST, GET, PUT) the response type will be action-result (POST & PUT) or a single entity or a collection of entities (GET).
201
Created	Returned on successful creation of a new resource via POST requests.
202
Accepted	Lexware has accepted the request. Further processing has to be done. Depending on the used endpoint you can query the processing status.
204
No Content	The resource was successfully deleted.
400
Bad Request	Malformed syntax or a bad query.
401
Unauthorized	Action requires user authentication.
402
Payment Required	Action not accessible due to a Lexware contract issue. For details see Error Codes.
403
Forbidden	Authenticated but insufficient scope or insufficient access rights in Lexware.
404
Not Found	Requested resource does no exist (anymore).
405
Not Allowed	Method not allowed on resource.
406
Not Acceptable	Validation issues due to invalid data.
409
Conflict	Indicates that the request is not allowed due to the current state of the resource. For instance, an outdated version field send with PUT.
415
Unsupported Media Type	Missing Content-Type header for POST and PUT requests. Only application/json is supported besides file uploads where multipart/form-data is expected.
429
Too Many Requests	May occur if incoming requests exceed the rate limit. The request should be retried again at a later time.
500
Server Error	Internal server error. Please get in contact with us.
501
Not Implemented	Requested HTTP operation not supported.
503
Service Unavailable	Unable to handle the request temporarily.
504
Gateway Timeout	The proxied request from the gateway to the targeted services has timed out. This error occurs when the server did not answer before the request timeout of 30 seconds. It is possible that your request has been processed successfully.
Error Codes
The Lexware API provides two types of error objects which provide further information in case an error occurs during an API operation.

While extending functionality to the API we also improve the error handling. This happens on behalf of feedback we get from our users and technical aspects.

Authorization and Connection Error Responses
Status	Body	Cause
401
Unauthorized	{ "message": "Unauthorized" }	No token provided, invalid format of authorization token, invalid token or your API client is disabled.
403
Forbidden	{"message": "'{accessToken}' not a valid key=value pair (missing equal-sign) in Authorization header: 'Bearer {accessToken}'."}	Resource not available. Possibly wrong Url or method.
500
Internal Server Error	{ "message": null }	Lexware server not available or internal problem.
503
Service Unavailable	Detail information. May be null.	Lexware server not available.
504
Gateway Timeout	{ "message": "Endpoint request timed out" }	Endpoint request timed out. This timeout is set to 30 seconds for all requests.
Legacy error response
Sample for a legacy error response

{
  "IssueList": [
    {
      "i18nKey": "missing_entity",
      "source": "company.name",
      "type": "validation_failure",
      "additionalData": null,
      "args": null
    }
  ]
}
The following REST endpoints are using the legacy error response:

contacts
files
vouchers
Format of the Error Object

The error object is a JSON object only containing a JSON array named IssueList, which wraps one or more issue objects.

Each issue object contains the attributes i18nKey, source, type, additionalData and args.

Attribute	Description
i18nKey	error code (human readable)
source	Source for this error e.g. the attribute/field that could not be validated. May be null.
type	Global type/category
additionalData	Detail information. May be null.
args	e.g. valid range or locale code. May be null.
Bad Request Errors - Returned with HTTP Status Code 400

i18nKey	source	type	Description
bad_request_error	null	bad_request_error	This error may occur in many cases.
bad_request_error	size must be between {MIN_SIZE} and {MAX_SIZE}	bad_request_error	This error may occur in many cases. In case of the contact filter using email or name, the length of the value is out of range specified by {MIN_SIZE} and {MAX_SIZE}.
The list is partial and will be expanded in the future.
Validation Errors - Returned with HTTP Status Code 406

i18nKey	source	type	additionalData	args	Description
missing_entity	attribute name	validation_failure	null	null	The value must not be null or empty.
The list is not yet complete and will be expanded in the future.
Technical Errors - Returned with HTTP Status Code 500

i18nKey	source	type	additionalData	args	Description
technical_error	error source and contact_vendor_info_not_assigned	technical_error	null	null	The contact has a structural failure. Contact support for further investigations.
technical_error	error source and contact_is_neither_customer_nor_vendor	technical_error	null	null	The contact has a structural failure. Contact support for further investigations.
technical_error	error source and contact_has_not_mappable_email_address	technical_error	null	null	The contact has a structural failure. Contact support for further investigations.
technical_error	error source and contact_has_not_mappable_phone_number	technical_error	null	null	The contact has a structural failure. Contact support for further investigations.
technical_error	error source and contact_has_not_mappable_address	technical_error	null	null	The contact has a structural failure. Contact support for further investigations.
technical_error	error source and contact_has_not_mappable_country	technical_error	null	null	The contact has a structural failure. Contact support for further investigations.
The list is not yet complete and will be expanded in the future.
Regular error response
Sample JSON response of type regular error message

{
  "timestamp": "2023-05-11T17:12:31.233+02:00",
  "status": 406,
  "error": "Not Acceptable",
  "path": "/v1/invoices",
  "traceId": "90d78d0777be",
  "message": "Validation failed for request. Please see details list for specific causes.",
  "details": [
    {
      "violation": "NOTNULL",
      "field": "lineItems[0].unitPrice.taxRatePercentage",
      "message": "darf nicht leer sein"
    }
  ]
}
All REST endpoints, except those listed above with the legacy error response, use the regular error response. For example:

event-subscriptions
invoices
order-confirmations
profile
voucherlist
Format of the Error Object

The error object is a JSON object.

                    Property	Description
timestamp
dateTime	Detailed information about the time when the error has occurred.
status
string	HTTP status code. E.g. 406 in case the payload can´t be accepted because of validation issues. A list of used HTTP status codes can be found here.
error
string	A brief description of the error code.
path
string	Information about the called REST endpoint.
traceId
string	A unique id allowing us to trace the error in our logs.
message
string	Human readable information about the occurred error. This message is not suitable for presenting it to your applications end-users.
details
object	An optional list of additional information about the validation issues.
Description of the Details Object

                    Property	Description
violation
string	Information about the type of violation. E.g. NOTNULL indicates a missing data for a mandatory field.
field
string	Name and location of property involved in the validation error.
message
string	Human readable information about the occurred error.
This message is not suitable for presenting it to your application's end-users.
FAQ
Meaning of collective contact (e.g. customer or vendor)
A collective customer / vendor is a concept of a generic contact, against which different bookkeeping actions can be referenced. It can be used, if the user of Lexware didn't want to create an explicit customer/vendor for each voucher.

In context of the API this means, that an API consumer (Shop-Plugin, App, etc.) can provide a configuration possibility for the user to allow using the collective contact in favor of creating new contacts for each e.g. order.




Getting HTTP Status Code 401
If you retrieve this HTTP status code it is possible, that the Lexware API is temporarily unavailable which you can verify on the Lexware status page. Otherwise, your request could be missing the authorization header or contain an invalid access token.




URI Components
Lexware API URI components

The URI components follow the pattern: https://{hostname}/{version}/{resourceUri}{?query}.

Hostname

The host name (base URI) is the first segment of the APIs URI.

{resourceurl}/v1/vouchers

Version

The current API version is v1 and will be changed only if breaking changes are required. See our change log for possible breaking changes.

{resourceurl}/v1/vouchers

Resource URI

The resource URI is the endpoint which provides functionality to create, update and read Lexware objects.

{resourceurl}/v1/contacts

Query

An optional query string containing key-value pairs separated by a delimiter can used both to filter resources by its property values and control the paging of resources of collections (list of resources).

{resourceurl}/v1/contacts?page=0

Various reserved and non-ASCII characters require URL encoding when used in query strings. These characters include spaces, ampersands, semicolons, and greater than/less than symbols.
Search string encoding
A number of endpoints allow searching for text strings such as a voucher numbers, or contact names.

Due to technical constraints, for some of these endpoints, including the contact endpoint, the vouchers endpoint, and the voucherlist endpoint, these strings require special handling with respect to non-alphabetic characters: The HTML special characters &, <, and > need to be sent to Lexware in their html encoded form, i.e. &amp; for &, &lt; for <, and &gt; for >. However, as passing the search string via a query argument requires that query to be url encoded as well, the search string needs to be both html encoded and url encoded.

Searching for a name of "johnson & partner" in the contact endpoint requires a query string such as name=johnson%20%26amp%3B%20partner.

The html encoding needs to match the canonical representation as stored in the Lexware database. Do not use unicode character encoding or any other form of representation.

Please note that other endpoints will not yield the expected results when this encoding is used.

Create a Lexware account

To sign up for a new company, visit https://app.lexware.de/signup and click on "Kostenlos registrieren". The signup only requires email and password.

After successful registration check you mailbox for the verification email to confirm the signup.

The created account can be used free within 30 days and has all available features. You can create as many accounts as you need.
Get an API key
After signing up for Lexware, users can generate their private API key at https://app.lexware.de/addons/public-api.

Find out your organization id
You can get the organization id of your Lexware account via browser console (open via F12) using the following command:

lxo.organizationId

Stay informed about the system status
You can stay updated on the current status of the Lexware app and the operational status of our services by visiting our status page at https://status.lexware.de.

We highly recommend that users and partners of our API subscribe to email notifications to receive timely updates. You can subscribe to the status updates directly on the status page.

Valid tax rates
The default German tax rates are 7% and 19% (reflected by the numeric values 7 and 19 for various taxRate properties). However, in certain scenarios, other tax rates must be used:

European VAT rates for distance sales
Starting July 2021, Lexware supports the vat rates of all countries in the EU. This enables users to create and book vouchers for distance sales and electronic services provided to consumers in (non-German) EU countries.

These tax rates are only valid when

creating/updating vouchers that represent users' invoices and that are booked with the distance sales or electronic service posting categories
creating sales vouchers such as invoices for users' sales to B2C customers in the EU that are marked as distance sales or electronic services
... and the organization's distanceSalesPrinciple is set to DESTINATION.

A reference of tax rates for european countries can be found here (English version).

Corona virus relief package 2020
During the 2020 corona virus pandemic, the German administration enacted a temporary reduction of the VAT rates (Umsatzsteuer/USt, Mehrwertsteuer/MwSt). The tax rates that Lexware accepts for the various voucher types depend on the voucherDate of the respective voucher.

Bookkeeping vouchers as managed by the vouchers endpoint may be used with any tax rate valid before, during, and after the tax rate reduction (i.e., with 0%, 5%, 7%, 16%, and 19%).

Vouchers of the quotations, order confirmations, invoices, and credit notes endpoints will only be allowed to use tax rates valid on the relevant date. The relevant date is determined as follows:

for voucher types without shippingConditions (i.e., quotations, credit notes), the relevant date is voucherDate
for voucher types with shippingConditions (i.e., order confirmations, invoices) and
shippingType none, the relevant date is voucherDate
for shippingType service or delivery, the relevant date is shippingDate
for shippingType serviceperiod or deliveryperiod, the relevant date is shippingEndDate
An invoice, order confirmation, ... with a relevant date 2020-06-25 may only refer to tax rates 0%, 7%, or 19%; with a relevant date of 2020-07-01, only 0%, 5% and 16% are valid.

XRechnung
XRechnung is a machine readable standardized format for the exchange of invoices and similar vouchers. Invoices addressed to German public authorities may mandatorily be required to be in the XRechnung format.

Lexware allows the creation of invoices and download of XRechnung XML files.

Please note that we currently do not support the XRechnung format for credit-notes or down payment invoices.
In order to be able to create an XRechnung for an authorities contact, some prerequisites need to be fulfilled.

The invoice to be created must:

have the tax type net
reference an existing contact (using the contactId attribute)
include a non-zero number of line items
have all line items (except type text) including a quantity, a unit and a name
The referenced contact must:

have a Leitweg-ID (buyerReference) and a vendor number at the customer (vendorNumberAtCustomer) (see XRechnung properties in the contact endpoint)
have a billing address including zip code and city
The organization's company data must:

include the company name
include contact data with an address (including zip code, city, and country), phone number, and e-mail address
have set tax identifiers
The footer in the print layout must:

include a bank account
The organization's company data and print layout settings are validated only when the invoice is being finalized. These data may be missing for invoices in draft mode.
Please also find more information here:

General information about XRechnung
Creating a XRechnung with Lexware
Country codes
Lexware supports ISO 3166 alpha2 country codes for addresses, e.g. in contacts, or within vouchers etc. However, certain European regions require divergent tax handling, despite being part of a EU country. This includes, e.g., the Spanish Canary Islands.

Support for these countries is provided by extended ISO-3116-2 country codes such as ES_CN (Canary Islands) or GR_69 (Mount Athos).

When called with an invalid country code, endpoints such as the invoices endpoint will report the full list of currently supported country codes.

A list of all available countries and their codes can be requested using the countries endpoint.

Datetime format
Lexware accepts and returns timestamps as described in RFC 3339/ISO 8601 with the following pattern yyyy-MM-ddTHH:mm:ss.SSSXXX, where the time separator must be the letter T, the milliseconds must be given exactly with 3 digits and the timezone be either Z or specified as an offset in the format +00:00 (with colon).

Other patterns are not recognized and cannot be parsed which will result in a 406 response.

For example, a valid timestamp in Central European Time is 2022-04-27T09:30:00.000+02:00.

Texts in sales vouchers
The sales voucher endpoints (from quotations to credit notes) allow submission of text strings for introduction, remark, etc.

Line breaks in these texts can be submitted by using the escape code "\n".

These are the current maximum lengths of the text fields:

introduction=2000
remark=2000
deliveryTerms=255
title=25
lineItemName=255
lineItemDescription=2000
Samples
The samples for the Lexware API REST endpoints are provided as a generic Postman collection.

Postman is a free app for API development which allows to easily test REST APIs and supports any type of required "infrastructure". E.g. authorization (basic, token, etc.) as well as header-manipulation, body data, etc.

Importing the samples
The Lexware samples can be directly imported into Postman via the Import button at the left top (Import File -> Choose Files).

Postman Collection Import

Initial setup
To run the samples via the blue Send button, an "environment" needs to be configured within Postman.

The pre-configured Lexware environment can be directly imported into Postman via the Manage Environments dropdown at the right top and choosing (Import) in the subsequent dialog.

Postman uses string substitution to replace variable names enclosed in double curly braces – like {{variableName}} with its corresponding value as a global, collection, or environment variable.
In the postman samples, we use {{resourceurl}} and {{accessToken}} to make testing as easy as possible.
Postman Environment Import

Accessing endpoints with your API Key
As a first step, you can use Postman to familiarize with the Lexware API.

Tip: As our sample requests contain an environment variable in the authorization header field, you can add your access token to all requests by updating the accessToken field in the Postman environment to contain your access token.

Postman Bearer Auth Header

Ping Endpoint response

{
    "userEmail": "yourEmail@example.org"
}
After clicking "Send" you should receive a JSON response with the email address of your authorized Lexware account.

Tip: Postman can generate action basic code in several languages from any sample (e.g. PHP, C#, Java, JavaScript, Ruby, Swift, etc.). Just press the Code link which is located just below the send button.

Postman Code Generation

Change Log
Change log of Lexware API

API Changes

21.08.2025 - Added new read-only property retroactiveInvoice to the recurring-templates endpoint.
13.08.2025 - Simplified access and download of sales voucher documents. The following is now deprecated and marked for removal: files objects, documentFileId properties, the document subresource in sales voucher endpoints and downloading sales voucher documents via the files download endpoint.
13.08.2025 - Added a new subresource file (GET) available for all sales voucher endpoints (e.g. invoice file endpoint.
27.05.2025 - Rebranding Update: The product lexoffice was renamed to Lexware Office, the brand itself is Lexware. All instances of the company and product name have been updated, including all urls and domains. Please update your integrations accordingly. The new resource url is https://api.lexware.io.
03.03.2025 - Added voucherId to the response of a successful file upload using the file upload endpoint.
14.01.2025 - New permalink for contacts.
13.01.2025 - New read-only property electronicDocumentProfile in sales voucher endpoints such as the invoices endpoint.
18.12.2024 - Added new FAQ about lexoffice status page to check operational status of lexoffice systems and subscribe for status updates.
12.12.2024 - Add voucher status "open" to the delivery notes endpoint and the order confirmations endpoint. Disable pursuing and PDF rendering for delivery notes and order confirmations with the voucher status "draft". Add the events delivery-note.status.changed and order-confirmation.status.changed to the event subscriptions endpoint.
28.10.2024 - Allow upload of e-invoice bookkeeping vouchers in XML format using the files endpoint or the subresource vouchers/{id}/files.
16.09.2024 - Added Location header with the resource url to all successful creation responses containing a resourceUri.
11.09.2024 - Added download of e-invoice bookkeeping vouchers to the files endpoint.
05.09.2024 - Added paymentItemType irrecoverableReceivable to the payments endpoint.
08.08.2024 - The voucher.created and voucher.changed events are now triggered for "unchecked" vouchers.
01.08.2024 - Updated the validation process for XRechnung invoices: Company data and print settings are now checked only during finalization.
01.08.2024 - Allow creation of Vouchers with status "unchecked", and allow access to purchase invoices and credit notes.
19.07.2024 - Removed description of line item as a required field for an XRechnung.
11.07.2024 - Added new articles endpoint
03.07.2024 - Adjusted the automatic unsubscription of events with a response status code 404 to occur only after the retry strategy is applied.
24.06.2024 - Added Location header with the resource url to the successful event-subscription creation response.
12.06.2024 - Adjusted retry behavior of event delivery and introduce automatic unsubscription of dead subscriptions.
10.06.2024 - Added contactName attribute to the vouchers endpoint.
13.05.2024 - New Print Layouts endpoint and reference in sales voucher endpoints.
07.05.2024 - Extension of the Public Api key management, allowing multiple keys per user, scope selection and key renewal.
22.04.2024 - Adjusted contacts filter to also search for email addresses in company contact persons.
22.01.2024 - Enabled referencing an existing product or service in the line items record of sales vouchers.
30.11.2023 - Added paymentItems attribute to the payments endpoint.
23.10.2023 - Activation of API Rate Limits
13.10.2023 - Documentation of voucherStatus unchecked in voucher and voucherlist endpoints
20.09.2023 - Describe limitation of maximum number of lineItems per sales voucher
18.07.2023 - Describe pattern matching filter options in contacts endpoint.
10.07.2023 - Update timestamps for all samples in this documentation to reflect the current year.
05.07.2023 - Assigned voucher image files omitted during voucher update will now finally delete them.
23.05.2023 - New FAQ describing text fields in sales vouchers
24.01.2023 - Added taxType photovoltaicEquipment for quotations, order-confirmations, down-payment-invoices, invoices, and credit-notes endpoints.
24.01.2023 - Removed rendering type for factoring invoices.
16.08.2022 - Allow filtering the voucherlist by "any" voucherStatus and voucherType
25.07.2022 - Added paidDate attribute to payments endpoint.
09.02.2022 - Added new table for better overview of existing page size limits per endpoint (see table under Paging of Resources).
20.01.2022 - New businessFeatures property in profile endpoint result
25.10.2021 - The voucherlist endpoint can now filter by voucher number; filtering in the voucher endpoint is deprecated
13.10.2021 - The URL for creation of public API keys has changed
10.08.2021 - Added new filter to search the voucherlist by contact id and various date ranges, and extended the result set by attributes createdDate, updatedDate and contactId.
20.07.2021 - Added new endpoints delivery notes and dunnings (GET/POST for each). Delivery notes are accessible in the voucherlist endpoint.
01.07.2021 - lexoffice now supports distance sales and electronic services in the EU. This introduces the new taxSubType attribute in the taxConditions of sales voucher endpoints (e.g., invoices endpoint, new posting category IDs for the vouchers endpoint, new tax rates of the EU destination countries, and various new validations for distance sales bookkeeping and sales vouchers. The new property distanceSalesPrinciple is now available via the profile
28.04.2021 - Added relatedVouchers attribute to quotations, order-confirmations, down-payment-invoices, invoices, and credit-notes endpoints.
28.04.2021 - Enabled pursue actions for order-confirmations, invoices, and credit-notes.
22.03.2021 - Added new endpoint posting-categories (GET).
23.02.2021 - Technical updates and improved syntax highlighting.
18.02.2021 - Added new endpoint recurring templates (GET) to retrieve the templates of recurring invoices and extended invoices resource by property recurringTemplateId referencing the template if exists.
16.02.2021 - Added closingInvoiceId attribute to down-payment-invoices endpoint.
09.02.2021 - Added the new paymentTermsLabelTemplate attribute in various sales voucher endpoints, and renamed attribute paymentTermsLabel to paymentTermsLabelTemplate in payment-conditions endpoint
02.02.2021 - Added new endpoint payment-conditions
01.02.2021 - Added read-only access to closing invoices through the invoices endpoint, to down payment invoices through the newly created down payment invoice endpoint, and their listing in the voucher list
12.01.2021 - Added new endpoint countries (GET).
21.12.2020 - Fixed files endpoint where the Content-Disposition header including the filename for downloads was missing.
17.12.2020 - Added support for the creation of an XRechnung (standard for electronic transmission of invoices to public authorities). Extended endpoints are invoices, contacts and files. For more info see FAQ.
02.11.2020 - BREAKING: Changed contacts api allowing any salutations up to 25 characters and made it an optional property.
12.10.2020 - Added new endpoint payments (GET).
30.09.2020 - Added shippingDate attribute to vouchers endpoint.
20.08.2020 - Adjusted sales voucher endpoints to also use contact-specific defaults for the properties payment conditions, total discount and delivery terms if no value is provided.
06.07.2020 - Added primary attribute for company contact person to contact endpoint.
06.07.2020 - Adapted tax rate faq to reference shipping dates
06.07.2020 - Added contactPerson attribute to address record of sales vouchers
29.06.2020 - Adapted tax rate faq
23.06.2020 - Added description of tax rates valid due to the corona stimulus package (Konjunkturpaket)
16.04.2020 - Added user id to profile endpoint.
02.04.2020 - Allow order-confirmations events.
31.03.2020 - Allow access to bookkeeping vouchers for the types salesinvoice & salescreditnote
07.01.2020 - Added new endpoint quotations and the related information in voucherlist and event subscription endpoints
26.11.2019 - Extended invoicing endpoints allowing to set the title and free text positions in line items.
23.11.2019 - Released new endpoint order confirmations (GET/POST).
30.10.2019 - Allowed more vat-free tax types for the creation of sale vouchers such as invoices.
28.10.2019 - Extended endpoints invoices, credit notes and order confirmations by language property allowing to create vouchers in English.
10.10.2019 - Extended profile endpoint returning the default tax type of the organization and weather it is a small business.
19.09.2019 - Added information on validation of shipping conditions when creating an invoice.
27.08.2019 - Technical updates.
19.08.2019 - Added new subscription event types created and deleted. Also made event subscriptions available for credit notes.
05.08.2019 - Added explanation for optimistic locking.
24.07.2019 - Added new endpoint voucherList (GET).
09.07.2019 - Added new endpoint credit notes (GET/POST).
02.07.2019 - Added new subscription event for invoice changes.
cURL