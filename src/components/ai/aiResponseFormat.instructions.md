# Réponse de l'ia

Suite à un message user envoyé au serveur, voici le flow de réponse.

## Première réponse

```json
{
  "id": "stream:m171nfzdawrhkrfe2fp99j8dt57x705g",
  "key": "m57325de6h99f0kj5cshtzqncn7x6tdk-1-1",
  "order": 1,
  "stepOrder": 1,
  "status": "streaming",
  "agentName": "Nolë",
  "text": "",
  "_creationTime": 1765668573080,
  "role": "assistant",
  "parts": []
}
```

Puis

```json
{
  "id": "stream:m171nfzdawrhkrfe2fp99j8dt57x705g",
  "key": "m57325de6h99f0kj5cshtzqncn7x6tdk-1-1",
  "order": 1,
  "stepOrder": 1,
  "status": "streaming",
  "agentName": "Nolë",
  "text": "",
  "_creationTime": 1765668574672,
  "role": "assistant",
  "parts": [
    {
      "type": "step-start"
    }
  ]
}
```

## Appel d'un objet (tool_use)

### Déclaration de l'appel

Ici, le modèle dit qu'il appelle un outil et lui donne un input. A ce stade, on ne connait que le type d'outil appelé.

```json
{
  "id": "stream:m171nfzdawrhkrfe2fp99j8dt57x705g",
  "key": "m57325de6h99f0kj5cshtzqncn7x6tdk-1-1",
  "order": 1,
  "stepOrder": 1,
  "status": "streaming",
  "agentName": "Nolë",
  "text": "",
  "_creationTime": 1765668574961,
  "role": "assistant",
  "parts": [
    {
      "type": "step-start"
    },
    {
      "type": "tool-web_search", // Peut être un autre nom d'outil, mais commence toujours par tool-
      "toolCallId": "toolu_01GQVCtmLkVXsiSMSZP8g5kF",
      "state": "input-streaming"
    }
  ]
}
```

### Output de l'outil disponible

A cette étape, on a l'input et l'output de l'outil appelé. On pourra les afficher dans l'interface utilisateur.

```json
{
  "id": "stream:m171nfzdawrhkrfe2fp99j8dt57x705g",
  "key": "m57325de6h99f0kj5cshtzqncn7x6tdk-1-1",
  "order": 1,
  "stepOrder": 1,
  "status": "streaming",
  "agentName": "Nolë",
  "text": "",
  "_creationTime": 1765668577717,
  "role": "assistant",
  "parts": [
    {
      "type": "step-start"
    },
    {
      "type": "tool-web_search",
      "toolCallId": "toolu_01GQVCtmLkVXsiSMSZP8g5kF",
      "state": "output-available",
      "input": {
        "objective": "Find information about Scrintal - what the software does, its main features, and purpose. Looking for details about this product from their official website or reviews. Comparing to Spine AI as a potential competitor.",
        "search_queries": [
          "Scrintal app features",
          "Scrintal visual note taking",
          "scrintal.com what is it"
        ]
      },
      "output": [
        {
          "details": "voir fin du doc"
        }
      ]
    }
  ]
}
```

## Réponse de l'IA suite à l'exécution de l'outil

Ici, le modèle reprend la parole et stream sa réponse, suite à l'appel de l'outil.

````json
{
    "id": "stream:m171nfzdawrhkrfe2fp99j8dt57x705g",
    "key": "m57325de6h99f0kj5cshtzqncn7x6tdk-1-1",
    "order": 1,
    "stepOrder": 1,
    "status": "streaming",
    "agentName": "Nolë",
    "text": "## Résumé ",
    "_creationTime": 1765668580568,
    "role": "assistant",
    "parts": [
        {
            "type": "step-start"
        },
        {
            "type": "tool-web_search",
            "toolCallId": "toolu_01GQVCtmLkVXsiSMSZP8g5kF",
            "state": "output-available",
            "input": {
                "objective": "Find information about Scrintal - what the software does, its main features, and purpose. Looking for details about this product from their official website or reviews. Comparing to Spine AI as a potential competitor.",
                "search_queries": [
                    "Scrintal app features",
                    "Scrintal visual note taking",
                    "scrintal.com what is it"
                ]
            },
            "output": [
                {
                    "details": "voir fin du doc"
                }
            ]
        },
        {
            "type": "step-start"
        },
        {
            "type": "text",
            "text": "## Résumé ",
            "state": "streaming"
        }
    ]
}

## Réponse complète

Voici à quoi ressemble un message de l'ia (du hook )

```json
{
  "_creationTime": 1765665265155.9353,
  "agentName": "Nolë",
  "id": "ks735jsefjbaadkrndbnq8jmjd7x710h",
  "key": "m57325de6h99f0kj5cshtzqncn7x6tdk-0-1",
  "order": 0,
  "parts": [
    {
      "type": "step-start"
    },
    {
      "callProviderMetadata": {
        "anthropic": {
          "cacheCreationInputTokens": 0,
          "container": null,
          "stopSequence": null,
          "usage": {
            "cache_creation": {
              "ephemeral_1h_input_tokens": 0,
              "ephemeral_5m_input_tokens": 0
            },
            "cache_creation_input_tokens": 0,
            "cache_read_input_tokens": 0,
            "input_tokens": 774,
            "output_tokens": 134,
            "service_tier": "standard"
          }
        }
      },
      "input": {
        "objective": "Find information about Spine AI (getspine.ai) - what the software does, its main features, and purpose. Looking for details about this product from their official website or reviews.",
        "search_queries": [
          "getspine.ai what is it",
          "Spine AI software features",
          "getspine.ai product overview"
        ]
      },
      "output": [
        {
          "excerpts": [
            "Spine AI\n\n#### Re-Run Every Branch with New Inputs\n\nChange an input from the beginning, and Spine automatically re-runs every branch downstream. No need to start over—your entire workflow updates instantly with the new information. One workspace. All your context. 300+ models. No more starting from zero. ## Use Cases\n\nSpine adapts to your role, not the other way around. Product Managers Founders Marketers & PMMs Designers & Creatives Knowledge Workers\n\nProduct Strategy\n\n### Plan quickly. Execute faster. \"PM's are juggling user research, feature planning, and stakeholder alignment across multiple tools, losing context and momentum.\" #### Feature Launch Strategizer\n\nNew product feature? Conduct industry research, competitor analysis, and generate a marketing plan, feature positioning, and more."
          ],
          "publish_date": "2025-01-01",
          "title": "Spine AI - The Visual Workspace for AI",
          "url": "https://www.getspine.ai/"
        },
        {
          "excerpts": [
            "* [Home](https://softwarefinder.com)\n* [Artificial Intelligence](/artificial-intelligence)\n* [Spine AI](/artificial-intelligence/spine-ai)\n\n# Spine AI\n\n0\n\n[Write a review](/review/artificial-intelligence/spine-ai)\n\nWatch Demo Get Pricing\n\n[* Overview](/artificial-intelligence/spine-ai) [* Features](/artificial-intelligence/spine-ai) [* Pros and Cons](/artificial-intelligence/spine-ai) [* FAQs](/artificial-intelligence/spine-ai) [* Alternatives](/artificial-intelligence/spine-ai/alternatives)\n\nLast Updated May 21, 2025\n\n## Overview\n\nSpine AI software streamlines recruitment by automating candidate sourcing, outreach, and screening, saving valuable time for recruiters. While setup may be challenging for teams new to AI tools, its seamless integration and talent prioritization make it a strong choice for modern hiring workflows. ## See The Software In Action  \nWatch Free Demo!"
          ],
          "publish_date": "2025-05-21",
          "title": "Spine AI: Pricing, Free Demo & Features",
          "url": "https://softwarefinder.com/artificial-intelligence/spine-ai"
        },
        {
          "excerpts": [
            "Spine Canvas will be where ideas are born, developed, and shipped—the default starting point for any serious intellectual endeavor. This is bigger than productivity software. This is about **fundamentally changing how humans and AI work together** —not as master and servant, but as creative partners in an unlimited thinking workspace. ### Join the Revolution\n\nThe age of prompt engineering is ending. The age of **collaborative intelligence** is beginning. Every breakthrough in human history has come from expanding our capacity to think, create, and collaborate. The printing press. The personal computer. The internet. Spine Canvas is the next chapter. We're building the infrastructure for human creativity in the AI age. A place where your ideas can grow without limits, where AI amplifies rather than replaces human insight, and where the full power of artificial intelligence serves human imagination. The future of thinking is visual, collaborative, and unlimited."
          ],
          "publish_date": "2025-01-01",
          "title": "The Spine Manifesto",
          "url": "https://www.getspine.ai/manifesto"
        },
        {
          "excerpts": [
            "Reply reply Share Share 2 more replies\n\n2 more replies [More replies](/r/selfpublish/comments/1h0lg7y/comment/lz4ta6d/)\n\n# Related Answers Section\n\nRelated Answers\n\n[Thoughts on Spine, the new AI publisher](/answers/39e7f440-dc56-449e-9135-70e2c15a9a78/?q=Thoughts%20on%20Spine%2C%20the%20new%20AI%20publisher&source=PDP)\n\n[Reviews of Spine publishing](/answers/5c4739a7-347f-4d71-a32b-3cd38ef56735/?q=Reviews%20of%20Spine%20publishing&source=PDP)\n\n[Legitimacy of Spine publishing](/answers/fb737074-a1fb-492d-b2f3-c0d52c95d8aa/?q=Legitimacy%20of%20Spine%20publishing&source=PDP)\n\n[Impact of AI books on authentic authors](/answers/cfeb5b3f-8678-4e8a-8856-04fa2e9e6572/?q=Impact%20of%20AI%20books%20on%20authentic%20authors&source=PDP)\n\nNew to Reddit? Create your account and connect with a world of communities."
          ],
          "publish_date": "2024-11-26",
          "title": "Thoughts on Spine (the new Ai publisher) : r/selfpublish",
          "url": "https://www.reddit.com/r/selfpublish/comments/1h0lg7y/thoughts_on_spine_the_new_ai_publisher/"
        },
        {
          "excerpts": [
            "[](/)\n\n[](/)\n\n* Solutions\n* Learn\n* [Customers](/customers)\n* [Pricing](/pricing)\n* [Product Tour](https://promptloop.navattic.com/w810ifz)\n\n# What Does Spine AI Do? - Company Overview\n\nLearn what Spine AI does, their products and services, target market, and business model. **Name:** Spine AI\n\n**Headquarters:** Toronto, Ontario, Canada\n\n**Employees:** 4\n\nSpine AI is an iterative AI research platform that enables users to generate and refine deep research reports, uncovering hidden insights from a wide range of sources. [Spine AI](https://getspine.ai) provides artificial intelligence tools, dashboards, and hosted software for building, deploying, and maintaining AI-powered analysts for business and research teams. ## [How Does Spine AI Work? \\#]()\n\nSpine AI synthesizes information from hundreds of websites, academic papers, news articles, and private documents to rapidly create comprehensive research reports."
          ],
          "publish_date": "2025-07-10",
          "title": "What Does Spine AI Do? - Company Overview | Directory",
          "url": "https://www.promptloop.com/directory/what-does-getspine-ai-do"
        },
        {
          "excerpts": [
            "Iteration becomes automatic and reproducible. Our public roadmap: [app.getspine.ai/roadmap](https://app.getspine.ai/roadmap)\n\n### **💼 Real Canvases Teams Are Building**\n\n* Market deep‑dives that flow into competitor profiles, battlecards, and executive memos — in minutes, not days\n* Content engines that turn one source into outlines, drafts, and platform‑ready assets (with visuals)\n* Founder/product strategy rooms mapping interviews (YouTube + PDFs) → insights → counterpoints → product bets → launch plans\n* Creative labs exploring concepts, visual directions, and brand systems\n* Learning hubs with curated sources, summaries, and living notes\n\nExplore our gallery: <https://app.getspine.ai/gallery>\n\n### **⚙️ Why This Matters**\n\n* **Transparency:** See what each block knows — no black-box memory. * **Control:** Direct sources by domain, date, or type; include your own docs and past chats. * **Speed:** Complex, multi-step work finishes in minutes and stays repeatable."
          ],
          "publish_date": "2023-01-01",
          "title": "Spine AI: Unlimited visual workspace to collaborate ...",
          "url": "https://www.ycombinator.com/companies/spine-ai"
        },
        {
          "excerpts": [
            "Spine AI is the first visual workspace that lets you branch conversations, connect disparate context, and orchestrate 300+ AI models on a ..."
          ],
          "publish_date": "2025-12-13",
          "title": "The Visual Workspace for AI - Spine AI",
          "url": "https://www.getspine.ai/templates/weekly-product-update-flow"
        },
        {
          "excerpts": [
            "Maria, my Spines account manager, and Andres, the formatting editor, were both proactive and incredibly helpful along the way. Their guidance made the process smooth and stress-free. Overall, Spines has proven to be a trustworthy and easy-to-work-with publisher—well worth the upfront financial investment. One note of caution: while their AI audiobook option is impressive, it does require some detailed “proof-listening” after conversion to ensure quality. All in all, I highly recommend Spines for authors looking for a reliable and professional self-publishing partner. November 11, 2025\n\nUnprompted review\n\nUseful 1\n\nShare\n\nReply from Spines\n\nThank you so much for sharing your experience, Eric. We’re delighted to hear that your transition into self-publishing felt smooth and supported. Wishing you great success with your newest book!"
          ],
          "publish_date": "2025-11-25",
          "title": "Read Customer Service Reviews of spines.com",
          "url": "https://www.trustpilot.com/review/spines.com"
        },
        {
          "excerpts": [
            "[Skip to main content]()\n\n[Spine Documentation home page](/)\n\nSearch...\n\n⌘K\n\n* [Support](mailto:support@getspine.ai)\n* [Try Spine](https://app.getspine.ai/)\n* [Try Spine](https://app.getspine.ai/)\n\nSearch...\n\nNavigation\n\nGetting Started\n\nWhat is Spine? * [Documentation](/introduction)\n* [Homepage](https://www.getspine.ai/)\n\n##### Getting Started\n\n* [What is Spine? ](/introduction)\n\n##### Block Types\n\n* [Chat Block](/chat-block)\n* [Prompt Block](/prompt-block)\n* [Deep Research Block](/deep-research-block)\n* [Memo Block](/memo-block)\n* [Image Generation Block](/image-generation-block)\n\n##### Advanced Features\n\n* [Context Passing](/context-passing)\n* [Duplicate and Re-run Branch](/duplicate-rerun-branch)\n\nOn this page\n\n* [Core Concepts]()\n* [Your First Canvas]()\n* [Video Overview]()\n* [Get Involved]()\n\nGetting Started\n\n# What is Spine?"
          ],
          "publish_date": "2025-09-19",
          "title": "What is Spine? - Spine Documentation",
          "url": "https://docs.getspine.ai/"
        },
        {
          "excerpts": [
            "**Diverse use cases**\n\nWe are able to support use cases across diverse industries and user bases by systematically gathering domain specific knowledge from our customers, and automatically inferring relevant data characteristics. Whether you’re in finance, retail, healthcare, telecoms, manufacturing, or any other industry, we can create an AI analyst for your business. **_Sales analyst_**\n\nUnderstand what outreach activities are getting attention, with who. Dig into team member performance, email deliverability and more, to better understand what’s effective and what’s not performing. **_eCommerce platform analyst_**\n\nGain insights into which products are selling the most and why. Analyze customer behavior, optimize inventory management, and uncover trends in purchase patterns to maximize your sales potential. **_ERP system analyst_**\n\nKeep projects on track by monitoring task progress, timelines, and budget adherence."
          ],
          "publish_date": "2025-11-23",
          "title": "Spine AI - Reliable AI data analysts that know your business",
          "url": "https://www.ycombinator.com/launches/LPs-spine-ai-reliable-ai-data-analysts-that-know-your-business"
        }
      ],
      "state": "output-available",
      "toolCallId": "toolu_01BCf5XA3yucL2aS2q91BkLn",
      "type": "tool-web_search"
    },
    {
      "providerMetadata": {
        "anthropic": {
          "cacheCreationInputTokens": 0,
          "container": null,
          "stopSequence": null,
          "usage": {
            "cache_creation": {
              "ephemeral_1h_input_tokens": 0,
              "ephemeral_5m_input_tokens": 0
            },
            "cache_creation_input_tokens": 0,
            "cache_read_input_tokens": 0,
            "input_tokens": 3705,
            "output_tokens": 473,
            "service_tier": "standard"
          }
        }
      },
      "state": "done",
      "text": "## Résumé de Spine AI (getspine.ai)\n\n**Spine AI** est un **espace de travail visuel infini** conçu pour collaborer avec l'IA. Voici les points clés :\n\n### 🎯 Concept principal\n- Un **canvas illimité** où tu peux créer, organiser et connecter des conversations IA\n- Accès à **300+ modèles d'IA** dans un seul espace\n- Philosophie : l'IA comme **partenaire créatif**, pas juste un outil\n\n### ⚡ Fonctionnalités clés\n- **Branches de conversation** : tu peux bifurquer et explorer différentes directions à partir d'une même idée\n- **Re-run automatique** : change un input, et toutes les branches en aval se mettent à jour automatiquement\n- **Contexte connecté** : relie différents blocs entre eux pour garder tout le contexte\n- **Deep Research** : synthétise des infos depuis des centaines de sources (sites web, articles académiques, documents privés)\n\n### 🧱 Types de blocs\n- Chat, Prompt, Deep Research, Mémo, Génération d'images\n\n### 👥 Cas d'usage\n- **Product Managers** : stratégie produit, analyse concurrentielle\n- **Marketers** : création de contenu multi-plateforme\n- **Founders** : mapping d'insights → décisions produit → plans de lancement\n- **Créatifs** : exploration de concepts et directions visuelles\n- **Knowledge workers** : hubs d'apprentissage avec notes vivantes\n\n### 🏢 Infos\n- Basé à Toronto, Canada\n- Startup Y Combinator\n\nEn gros, c'est un concurrent de tools comme Miro ou Notion, mais **centré sur l'IA** avec une approche visuelle et itérative.",
      "type": "text"
    }
  ],
  "role": "assistant",
  "status": "success",
  "stepOrder": 1,
  "text": "## Résumé de Spine AI (getspine.ai)\n\n**Spine AI** est un **espace de travail visuel infini** conçu pour collaborer avec l'IA. Voici les points clés :\n\n### 🎯 Concept principal\n- Un **canvas illimité** où tu peux créer, organiser et connecter des conversations IA\n- Accès à **300+ modèles d'IA** dans un seul espace\n- Philosophie : l'IA comme **partenaire créatif**, pas juste un outil\n\n### ⚡ Fonctionnalités clés\n- **Branches de conversation** : tu peux bifurquer et explorer différentes directions à partir d'une même idée\n- **Re-run automatique** : change un input, et toutes les branches en aval se mettent à jour automatiquement\n- **Contexte connecté** : relie différents blocs entre eux pour garder tout le contexte\n- **Deep Research** : synthétise des infos depuis des centaines de sources (sites web, articles académiques, documents privés)\n\n### 🧱 Types de blocs\n- Chat, Prompt, Deep Research, Mémo, Génération d'images\n\n### 👥 Cas d'usage\n- **Product Managers** : stratégie produit, analyse concurrentielle\n- **Marketers** : création de contenu multi-plateforme\n- **Founders** : mapping d'insights → décisions produit → plans de lancement\n- **Créatifs** : exploration de concepts et directions visuelles\n- **Knowledge workers** : hubs d'apprentissage avec notes vivantes\n\n### 🏢 Infos\n- Basé à Toronto, Canada\n- Startup Y Combinator\n\nEn gros, c'est un concurrent de tools comme Miro ou Notion, mais **centré sur l'IA** avec une approche visuelle et itérative."
}
````
