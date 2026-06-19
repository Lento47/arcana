export type SkillMeta = {
  name: string
  description: string
  version: string
  author?: string
  license?: string
  platforms?: string[]
  metadata?: {
    arcana?: {
      tags?: string[]
      related_skills?: string[]
    }
    hermes?: {
      tags?: string[]
      related_skills?: string[]
    }
  }
}

export type Skill = {
  id: string
  meta: SkillMeta
  body: string
  path: string
  category: string
}

export type SkillActivation = {
  skill: Skill
  args?: string
}
