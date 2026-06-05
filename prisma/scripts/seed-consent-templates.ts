/**
 * Seeds sample consent form templates.
 * Run: npx tsx prisma/scripts/seed-consent-templates.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const templates = [
  // ─────────────────────────────────────────────────────────────────────────
  // 1. General Consent & Medical History (new patient registration)
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: "tpl-general-consent",
    name: "General Consent & Medical History",
    type: "GENERAL" as const,
    description: "Sent to every new patient at registration. Covers medical history and general treatment consent.",
    introText:
      "Welcome to our clinic! Before we begin your treatment, please complete this short form. Your information is kept strictly confidential and used only to provide you with the best dental care.",
    consentText:
      "I hereby consent to the dental examinations, preventive dental care, and routine dental treatment that may be recommended for me. I understand that I have the right to ask questions about any procedure before it is performed.\n\nI confirm that the medical information I have provided is accurate and complete. I agree to inform the clinic immediately of any changes to my health or medications.\n\nI consent to the collection, storage, and use of my personal and health data for the purpose of dental treatment as required under the Personal Data Protection Act 2010 (Malaysia).",
    isActive: true,
    fields: [
      {
        label: "Full Name (as per IC/Passport)",
        fieldType: "TEXT" as const,
        isRequired: true,
        order: 0,
        options: [],
        placeholder: "e.g. Ahmad bin Abdullah",
        helpText: null,
        showIfFieldId: null,
        showIfValue: null,
      },
      {
        label: "Date of Birth",
        fieldType: "DATE" as const,
        isRequired: true,
        order: 1,
        options: [],
        placeholder: null,
        helpText: null,
        showIfFieldId: null,
        showIfValue: null,
      },
      {
        label: "Are you currently taking any medications?",
        fieldType: "YES_NO" as const,
        isRequired: true,
        order: 2,
        options: [],
        placeholder: null,
        helpText: "Include prescription drugs, supplements, and over-the-counter medicines.",
        showIfFieldId: null,
        showIfValue: null,
      },
      {
        label: "Please list your current medications",
        fieldType: "LONG_TEXT" as const,
        isRequired: false,
        order: 3,
        options: [],
        placeholder: "e.g. Aspirin 100mg daily, Metformin 500mg...",
        helpText: "Leave blank if none.",
        showIfFieldId: "cond-medications",
        showIfValue: "Yes",
      },
      {
        label: "Do you have any known drug or material allergies?",
        fieldType: "YES_NO" as const,
        isRequired: true,
        order: 4,
        options: [],
        placeholder: null,
        helpText: "e.g. penicillin, latex, local anaesthetic",
        showIfFieldId: null,
        showIfValue: null,
      },
      {
        label: "Please describe your allergies",
        fieldType: "LONG_TEXT" as const,
        isRequired: false,
        order: 5,
        options: [],
        placeholder: "e.g. Allergic to penicillin — rash and swelling",
        helpText: null,
        showIfFieldId: "cond-allergies",
        showIfValue: "Yes",
      },
      {
        label: "Do you have any of the following medical conditions?",
        fieldType: "MULTIPLE_CHOICE" as const,
        isRequired: true,
        order: 6,
        options: [
          "Diabetes",
          "Heart disease / hypertension",
          "Asthma or respiratory conditions",
          "Bleeding disorders",
          "Thyroid conditions",
          "Kidney or liver disease",
          "None of the above",
        ],
        placeholder: null,
        helpText: "Select the most relevant. You may mention others in the next field.",
        showIfFieldId: null,
        showIfValue: null,
      },
      {
        label: "Any other medical conditions or concerns?",
        fieldType: "LONG_TEXT" as const,
        isRequired: false,
        order: 7,
        options: [],
        placeholder: "Tell us anything else relevant to your dental care",
        helpText: null,
        showIfFieldId: null,
        showIfValue: null,
      },
      {
        label: "Are you pregnant or breastfeeding?",
        fieldType: "YES_NO" as const,
        isRequired: true,
        order: 8,
        options: [],
        placeholder: null,
        helpText: "This helps us avoid X-rays or certain medications during your visit.",
        showIfFieldId: null,
        showIfValue: null,
      },
      {
        label: "Have you had any adverse reactions to dental treatment before?",
        fieldType: "YES_NO" as const,
        isRequired: true,
        order: 9,
        options: [],
        placeholder: null,
        helpText: null,
        showIfFieldId: null,
        showIfValue: null,
      },
      {
        label: "Please describe the previous adverse reaction",
        fieldType: "LONG_TEXT" as const,
        isRequired: false,
        order: 10,
        options: [],
        placeholder: "What happened and when?",
        helpText: null,
        showIfFieldId: "cond-adverse",
        showIfValue: "Yes",
      },
      {
        label: "I confirm the information above is true and accurate",
        fieldType: "CHECKBOX" as const,
        isRequired: true,
        order: 11,
        options: [],
        placeholder: "Check to confirm",
        helpText: null,
        showIfFieldId: null,
        showIfValue: null,
      },
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────
  // 2. Dental Implant Consent
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: "tpl-implant-consent",
    name: "Dental Implant Consent",
    type: "TREATMENT" as const,
    treatmentType: "Implant",
    description: "Treatment-specific consent for dental implant procedures.",
    introText:
      "Your dentist has recommended a dental implant procedure. Please read the following information carefully and sign below to confirm your understanding and agreement.",
    consentText:
      "I understand that a dental implant is a titanium fixture surgically placed into my jawbone to support a crown, bridge, or denture. I have been informed of the following:\n\n• SUCCESS RATES: Implants have a high success rate but are not guaranteed. Failure can occur due to infection, poor bone integration, smoking, or systemic disease.\n\n• RISKS & COMPLICATIONS: Including but not limited to: infection, nerve damage, sinus perforation, implant failure, and the need for bone grafting.\n\n• ALTERNATIVES: I have been informed of alternatives including conventional bridges and removable dentures.\n\n• POST-OPERATIVE CARE: I agree to follow all post-operative instructions, attend follow-up appointments, and maintain good oral hygiene.\n\n• SMOKING: I understand that smoking significantly increases the risk of implant failure.\n\nI consent to the dental implant procedure as explained by my dentist and agree to the treatment plan presented to me.",
    isActive: true,
    fields: [
      {
        label: "Which tooth/teeth are being treated?",
        fieldType: "TEXT" as const,
        isRequired: true,
        order: 0,
        options: [],
        placeholder: "e.g. Upper right 6 (tooth 16)",
        helpText: "Your dentist will have discussed this with you.",
        showIfFieldId: null,
        showIfValue: null,
      },
      {
        label: "Do you smoke or use tobacco products?",
        fieldType: "YES_NO" as const,
        isRequired: true,
        order: 1,
        options: [],
        placeholder: null,
        helpText: "Smoking significantly increases implant failure risk.",
        showIfFieldId: null,
        showIfValue: null,
      },
      {
        label: "Do you have diabetes?",
        fieldType: "YES_NO" as const,
        isRequired: true,
        order: 2,
        options: [],
        placeholder: null,
        helpText: "Uncontrolled diabetes can affect healing and implant success.",
        showIfFieldId: null,
        showIfValue: null,
      },
      {
        label: "Have you taken bisphosphonate medications (e.g. Fosamax, Boniva)?",
        fieldType: "YES_NO" as const,
        isRequired: true,
        order: 3,
        options: [],
        placeholder: null,
        helpText: "These medications can affect bone healing after surgery.",
        showIfFieldId: null,
        showIfValue: null,
      },
      {
        label: "I understand the risks and have had the opportunity to ask questions",
        fieldType: "CHECKBOX" as const,
        isRequired: true,
        order: 4,
        options: [],
        placeholder: "Check to confirm",
        helpText: null,
        showIfFieldId: null,
        showIfValue: null,
      },
      {
        label: "I agree to attend all follow-up appointments as scheduled",
        fieldType: "CHECKBOX" as const,
        isRequired: true,
        order: 5,
        options: [],
        placeholder: "Check to confirm",
        helpText: null,
        showIfFieldId: null,
        showIfValue: null,
      },
      {
        label: "Any questions or concerns not yet addressed?",
        fieldType: "LONG_TEXT" as const,
        isRequired: false,
        order: 6,
        options: [],
        placeholder: "Write any remaining questions here",
        helpText: "Your dentist will address these before starting treatment.",
        showIfFieldId: null,
        showIfValue: null,
      },
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────
  // 3. Extraction / Surgical Extraction Consent
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: "tpl-extraction-consent",
    name: "Tooth Extraction Consent",
    type: "TREATMENT" as const,
    treatmentType: "Extraction",
    description: "Consent for routine or surgical tooth extraction including wisdom teeth.",
    introText:
      "Your dentist has recommended that one or more teeth be removed. Please read this form carefully before signing.",
    consentText:
      "I consent to the extraction of the tooth/teeth as recommended by my dentist. I understand that:\n\n• LOCAL ANAESTHESIA will be administered to numb the area. Sensation will return within a few hours.\n\n• COMMON SIDE EFFECTS include: swelling, bruising, mild bleeding, and soreness for several days.\n\n• RARE COMPLICATIONS include: dry socket, infection, nerve numbness (usually temporary), damage to adjacent teeth, jaw stiffness, or incomplete removal requiring a follow-up procedure.\n\n• WISDOM TEETH: Surgical extraction of impacted wisdom teeth carries additional risks including prolonged numbness or tingling (paresthesia).\n\n• POST-OPERATIVE INSTRUCTIONS: I agree to follow all instructions regarding biting on gauze, avoiding hot food/drinks, not smoking, and keeping the area clean.\n\n• FOLLOW-UP: I agree to return if I experience unusual pain, swelling, or bleeding.",
    isActive: true,
    fields: [
      {
        label: "Which tooth/teeth are to be extracted?",
        fieldType: "TEXT" as const,
        isRequired: true,
        order: 0,
        options: [],
        placeholder: "e.g. Lower left wisdom tooth (48)",
        helpText: null,
        showIfFieldId: null,
        showIfValue: null,
      },
      {
        label: "Type of extraction",
        fieldType: "MULTIPLE_CHOICE" as const,
        isRequired: true,
        order: 1,
        options: ["Simple extraction", "Surgical extraction", "Wisdom tooth removal"],
        placeholder: null,
        helpText: "As discussed with your dentist.",
        showIfFieldId: null,
        showIfValue: null,
      },
      {
        label: "Are you currently on blood thinners or anticoagulants?",
        fieldType: "YES_NO" as const,
        isRequired: true,
        order: 2,
        options: [],
        placeholder: null,
        helpText: "e.g. Warfarin, Aspirin, Clopidogrel, Xarelto",
        showIfFieldId: null,
        showIfValue: null,
      },
      {
        label: "Have you had any problems with bleeding in the past?",
        fieldType: "YES_NO" as const,
        isRequired: true,
        order: 3,
        options: [],
        placeholder: null,
        helpText: null,
        showIfFieldId: null,
        showIfValue: null,
      },
      {
        label: "Do you have someone to accompany you home after the procedure?",
        fieldType: "YES_NO" as const,
        isRequired: true,
        order: 4,
        options: [],
        placeholder: null,
        helpText: "Recommended especially for surgical extractions under sedation.",
        showIfFieldId: null,
        showIfValue: null,
      },
      {
        label: "I have read and understood the consent above",
        fieldType: "CHECKBOX" as const,
        isRequired: true,
        order: 5,
        options: [],
        placeholder: "Check to confirm",
        helpText: null,
        showIfFieldId: null,
        showIfValue: null,
      },
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────
  // 4. Teeth Whitening Consent
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: "tpl-whitening-consent",
    name: "Teeth Whitening Consent",
    type: "TREATMENT" as const,
    treatmentType: "Whitening",
    description: "Consent for in-clinic or take-home teeth whitening procedures.",
    introText:
      "Thank you for choosing to brighten your smile! Please complete this form so we can ensure whitening is the right treatment for you.",
    consentText:
      "I consent to teeth whitening treatment as recommended. I acknowledge that:\n\n• RESULTS VARY: Whitening effectiveness depends on the natural shade and type of staining. Crowns, veneers, and fillings will NOT whiten.\n\n• SENSITIVITY: Tooth and gum sensitivity during and after treatment is common and usually temporary (24–72 hours).\n\n• GINGIVAL IRRITATION: Mild gum irritation may occur from the whitening gel.\n\n• MAINTENANCE: Results are not permanent. Avoid tea, coffee, red wine, and tobacco to prolong results.\n\n• SUITABILITY: Whitening is not recommended for pregnant/breastfeeding patients or those under 18.",
    isActive: true,
    fields: [
      {
        label: "Whitening method",
        fieldType: "MULTIPLE_CHOICE" as const,
        isRequired: true,
        order: 0,
        options: ["In-clinic (laser/LED)", "Take-home tray kit", "Both"],
        placeholder: null,
        helpText: "As discussed with your dentist.",
        showIfFieldId: null,
        showIfValue: null,
      },
      {
        label: "Have you had teeth whitening before?",
        fieldType: "YES_NO" as const,
        isRequired: true,
        order: 1,
        options: [],
        placeholder: null,
        helpText: null,
        showIfFieldId: null,
        showIfValue: null,
      },
      {
        label: "Do you currently experience tooth sensitivity?",
        fieldType: "YES_NO" as const,
        isRequired: true,
        order: 2,
        options: [],
        placeholder: null,
        helpText: "e.g. sensitivity to hot, cold, or sweet food/drinks",
        showIfFieldId: null,
        showIfValue: null,
      },
      {
        label: "Do you have crowns, veneers, or tooth-coloured fillings on visible teeth?",
        fieldType: "YES_NO" as const,
        isRequired: true,
        order: 3,
        options: [],
        placeholder: null,
        helpText: "These will not change colour during whitening.",
        showIfFieldId: null,
        showIfValue: null,
      },
      {
        label: "I understand results vary and are not guaranteed to reach a specific shade",
        fieldType: "CHECKBOX" as const,
        isRequired: true,
        order: 4,
        options: [],
        placeholder: "Check to confirm",
        helpText: null,
        showIfFieldId: null,
        showIfValue: null,
      },
      {
        label: "I understand sensitivity may occur and accept this risk",
        fieldType: "CHECKBOX" as const,
        isRequired: true,
        order: 5,
        options: [],
        placeholder: "Check to confirm",
        helpText: null,
        showIfFieldId: null,
        showIfValue: null,
      },
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────
  // 5. Orthodontic / Braces Consent
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: "tpl-ortho-consent",
    name: "Orthodontic Treatment Consent",
    type: "TREATMENT" as const,
    treatmentType: "Orthodontics",
    description: "Consent for braces, aligners, or other orthodontic appliances.",
    introText:
      "Orthodontic treatment is a significant commitment. Please read this form carefully — it covers what to expect and your responsibilities during treatment.",
    consentText:
      "I consent to orthodontic treatment (braces/aligners/appliances) as discussed with my orthodontist. I understand that:\n\n• DURATION: Treatment typically takes 12–36 months depending on complexity. Timelines are estimates only.\n\n• COOPERATION: Success depends on wearing appliances as instructed, avoiding prohibited foods, and maintaining excellent oral hygiene.\n\n• RISKS: Including root resorption, enamel decalcification (white spots from poor hygiene), gum recession, relapse if retainers are not worn, and temporary discomfort.\n\n• RETENTION: After active treatment, retainers must be worn as directed. Failure to wear retainers will result in teeth shifting back.\n\n• EMERGENCY VISITS: I understand I must contact the clinic promptly for broken brackets, wires, or loose appliances.\n\n• PHOTOGRAPHS & RECORDS: I consent to the taking of photographs, X-rays, and study models for treatment planning and records.",
    isActive: true,
    fields: [
      {
        label: "Type of orthodontic appliance",
        fieldType: "MULTIPLE_CHOICE" as const,
        isRequired: true,
        order: 0,
        options: ["Metal braces", "Ceramic (tooth-coloured) braces", "Clear aligners (e.g. Invisalign)", "Functional/removable appliance"],
        placeholder: null,
        helpText: "As discussed with your orthodontist.",
        showIfFieldId: null,
        showIfValue: null,
      },
      {
        label: "Patient age group",
        fieldType: "MULTIPLE_CHOICE" as const,
        isRequired: true,
        order: 1,
        options: ["Child (under 12)", "Teenager (12–17)", "Adult (18 and above)"],
        placeholder: null,
        helpText: null,
        showIfFieldId: null,
        showIfValue: null,
      },
      {
        label: "Do you have any existing dental work (crowns, implants, bridges)?",
        fieldType: "YES_NO" as const,
        isRequired: true,
        order: 2,
        options: [],
        placeholder: null,
        helpText: "Existing restorations may limit or complicate orthodontic movement.",
        showIfFieldId: null,
        showIfValue: null,
      },
      {
        label: "I understand the treatment duration is an estimate and may vary",
        fieldType: "CHECKBOX" as const,
        isRequired: true,
        order: 3,
        options: [],
        placeholder: "Check to confirm",
        helpText: null,
        showIfFieldId: null,
        showIfValue: null,
      },
      {
        label: "I agree to wear retainers as instructed after treatment",
        fieldType: "CHECKBOX" as const,
        isRequired: true,
        order: 4,
        options: [],
        placeholder: "Check to confirm",
        helpText: null,
        showIfFieldId: null,
        showIfValue: null,
      },
      {
        label: "I consent to photographs and X-rays for treatment records",
        fieldType: "CHECKBOX" as const,
        isRequired: true,
        order: 5,
        options: [],
        placeholder: "Check to confirm",
        helpText: null,
        showIfFieldId: null,
        showIfValue: null,
      },
      {
        label: "Additional comments or concerns",
        fieldType: "LONG_TEXT" as const,
        isRequired: false,
        order: 6,
        options: [],
        placeholder: "Anything you'd like your orthodontist to know",
        helpText: null,
        showIfFieldId: null,
        showIfValue: null,
      },
    ],
  },
];

async function main() {
  console.log("Seeding consent form templates…");

  for (const tpl of templates) {
    const { fields, ...templateData } = tpl;

    // Fix conditional field references — map placeholder IDs to the actual
    // within-template field index labels (since we don't have IDs yet, we use
    // the showIfFieldId as a label-based lookup key below).
    // First, create the template (without fields).
    await prisma.consentFormTemplate.upsert({
      where: { id: templateData.id },
      update: {
        ...templateData,
        fields: { deleteMany: {} },
      },
      create: {
        ...templateData,
      },
    });

    // Build an ordered list of fields first so we can resolve conditional refs
    // by label rather than ID.
    const labelToOrder: Record<string, number> = {};
    fields.forEach((f, i) => { labelToOrder[f.label] = i; });

    // Create fields, mapping showIfFieldId to the correct created field id.
    // Strategy: create all fields first without conditional refs, then patch.
    const createdFields = await Promise.all(
      fields.map((f) =>
        prisma.consentFormField.create({
          data: {
            templateId: templateData.id,
            label: f.label,
            fieldType: f.fieldType,
            isRequired: f.isRequired,
            order: f.order,
            options: f.options,
            placeholder: f.placeholder,
            helpText: f.helpText,
            showIfFieldId: null,
            showIfValue: null,
          },
        })
      )
    );

    // Patch conditional fields — resolve showIfFieldId by order index
    const conditionalPatches: { id: string; showIfFieldId: string; showIfValue: string | null }[] = [];
    fields.forEach((f, i) => {
      if (f.showIfFieldId) {
        // showIfFieldId is the order of the referenced field (as string key)
        // We encoded it as "cond-*" in general template; for others we just skip
        // Actually in our data above we stored it as "cond-medications" etc. for general,
        // but for simplicity we just resolve by order index string from conditional data.
        // Find the field with matching showIfFieldId pseudo-key by checking which field
        // has that label-derived key. Since we used "cond-" prefixed strings for general,
        // map them back to label index.
        const condMap: Record<string, string> = {
          "cond-medications": "Are you currently taking any medications?",
          "cond-allergies":   "Do you have any known drug or material allergies?",
          "cond-adverse":     "Have you had any adverse reactions to dental treatment before?",
        };
        const targetLabel = condMap[f.showIfFieldId] ?? f.showIfFieldId;
        const targetField = createdFields.find((cf) => cf.label === targetLabel);
        if (targetField) {
          conditionalPatches.push({
            id: createdFields[i].id,
            showIfFieldId: targetField.id,
            showIfValue: f.showIfValue,
          });
        }
      }
    });

    for (const patch of conditionalPatches) {
      await prisma.consentFormField.update({
        where: { id: patch.id },
        data: { showIfFieldId: patch.showIfFieldId, showIfValue: patch.showIfValue },
      });
    }

    console.log(`  ✓ ${templateData.name}`);
  }

  console.log(`\nDone — seeded ${templates.length} consent form templates.`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
