export type CollaborationTemplateSubject =
  | "Teaching Templates"
  | "Science"
  | "English"
  | "Maths"
  | "Gaeilge"
  | "Geography"
  | "History"
  | "Business Studies"
  | "French";

export type CollaborationTemplate = {
  id: string;
  subject: CollaborationTemplateSubject;
  title: string;
  src: string;
  width: 1600;
  height: 1200;
};

export const COLLABORATION_TEMPLATE_SUBJECTS: CollaborationTemplateSubject[] = [
  "Teaching Templates",
  "Science",
  "English",
  "Maths",
  "Gaeilge",
  "Geography",
  "History",
  "Business Studies",
  "French",
];

const asset = (path: string) => `/collaboration-templates/${path}`;

export const COLLABORATION_TEMPLATES: CollaborationTemplate[] = [
  ["Science", "Digestive System - Label and Explain", "science/01_digestive_system_label_explain.png"],
  ["Science", "Build 4 Atoms", "science/02_build_four_atoms.png"],
  ["Science", "Solar System - Label and Space Fact", "science/03_solar_system_label_space_fact.png"],
  ["Science", "Build an Atom - Teacher Choice", "science/04_build_an_atom_teacher_choice.png"],
  ["Science", "Series and Parallel Circuits", "science/05_series_parallel_circuits.png"],
  ["English", "Character Profile", "english/01_character_profile.png"],
  ["English", "Creative Writing Prompt", "english/02_creative_writing_prompt.png"],
  ["English", "Film Review", "english/03_film_review.png"],
  ["English", "Language Detective", "english/04_language_detective.png"],
  ["English", "Finish the Poem", "english/05_finish_the_poem.png"],
  ["Maths", "Algebra Challenge Grid", "maths/01_algebra_challenge_grid.png"],
  ["Maths", "Quadratic Equations Challenge Grid", "maths/02_quadratic_equations_challenge_grid.png"],
  ["Maths", "Area and Volume Challenge Grid", "maths/03_area_volume_challenge_grid.png"],
  ["Maths", "Coordinate Geometry Challenge Grid", "maths/04_coordinate_geometry_challenge_grid.png"],
  ["Maths", "Trigonometry Challenge Grid", "maths/05_trigonometry_challenge_grid.png"],
  ["Gaeilge", "Roghnaigh an Focal Ceart", "irish/01_roghnaigh_an_focal_ceart.png"],
  ["Gaeilge", "Líon na Bearnaí", "irish/02_lion_na_bearnai.png"],
  ["Gaeilge", "Léamh - Fíor nó Bréagach", "irish/03_leamh_fior_no_breagach.png"],
  ["Gaeilge", "Ceapadóireacht - Ransú Smaointe", "irish/04_ceapadoireacht_ransu_smaointe.png"],
  ["Gaeilge", "Litríocht - Léirmheas", "irish/05_litriocht_leirmheas.png"],
  ["Geography", "Plate Tectonics - Draw and Label", "geography/01_plate_tectonics_draw_label.png"],
  ["Geography", "Name That Landform", "geography/02_name_that_landform.png"],
  ["Geography", "Weather Map Detective", "geography/03_weather_map_detective.png"],
  ["Geography", "OS Map Skills Challenge", "geography/04_os_map_skills_challenge.png"],
  ["Geography", "Population Development and Migration", "geography/05_population_development_migration.png"],
  ["History", "Artefact Detective", "history/01_artefact_detective.png"],
  ["History", "Primary or Secondary", "history/02_primary_or_secondary.png"],
  ["History", "Cause or Consequence - Reformation", "history/03_cause_or_consequence_reformation.png"],
  ["History", "Irish History Timeline", "history/04_irish_history_timeline.png"],
  ["History", "Propaganda Detective", "history/05_propaganda_detective.png"],
  ["Business Studies", "Household Budget Challenge", "business/01_household_budget_challenge.png"],
  ["Business Studies", "Launch a Product - Marketing Mix", "business/02_marketing_mix.png"],
  ["Business Studies", "Refund or No Refund", "business/03_refund_or_no_refund.png"],
  ["Business Studies", "Business Documents - Put Them in Order", "business/04_business_documents_order.png"],
  ["Business Studies", "Demand and Supply - Market Challenge", "business/05_demand_supply_market_challenge.png"],
  ["French", "French in Pictures", "french/01_french_in_pictures.png"],
  ["French", "Où vas-tu ? - Town and Directions", "french/02_ou_vas_tu_town_directions.png"],
  ["French", "Mon Profil", "french/03_mon_profil.png"],
  ["French", "Complete the Conversation", "french/04_complete_the_conversation.png"],
  ["French", "Le Mot Manquant", "french/05_le_mot_manquant.png"],
  ["Teaching Templates", "Mind Map", "teaching/01_mind_map.png"],
  ["Teaching Templates", "KWL Board", "teaching/02_kwl_board.png"],
  ["Teaching Templates", "Compare & Contrast", "teaching/03_compare_contrast.png"],
  ["Teaching Templates", "Cause & Effect", "teaching/04_cause_effect.png"],
  ["Teaching Templates", "Frayer Model", "teaching/05_frayer_model.png"],
].map(([subject, title, path], index) => ({
  id: `elume-${String(index + 1).padStart(2, "0")}`,
  subject: subject as CollaborationTemplateSubject,
  title,
  src: asset(path),
  width: 1600 as const,
  height: 1200 as const,
}));

export function templatesForSubject(subject: CollaborationTemplateSubject) {
  return COLLABORATION_TEMPLATES.filter((template) => template.subject === subject);
}
