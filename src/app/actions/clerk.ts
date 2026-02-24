"use server"

import { clerkClient } from "@clerk/clerk-sdk-node"
import { createSupabaseServerClient } from "@/lib/supabase"

// Alias for backward compatibility within this file
const createSupabaseClient = createSupabaseServerClient;

async function getClerkUser(clerkUserId: string) {
  try {
    const supabase = createSupabaseClient()

    const { data, error } = await supabase
      .from("clerk_users")
      .select("id")
      .eq("clerk_user_id", clerkUserId)
      .maybeSingle()

    if (error) {
      return {
        success: false,
        error: error.message
      }
    }

    if (!data) {
      return {
        success: true,
        id: undefined
      }
    }

    return {
      success: true,
      id: data.id
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error occurred"
    }
  }
}

async function createClerkUser(params: { clerk_user_id?: string; email: string; first_name?: string; last_name?: string; organization_id?: string }) {
  try {
    if (!params.clerk_user_id) {
      return {
        success: false,
        error: "clerk_user_id is required to create a user."
      };
    }

    const supabase = createSupabaseClient()

    // First check if the user already exists
    const { data: existingUser, error: checkError } = await supabase
      .from("clerk_users")
      .select("id")
      .eq("clerk_user_id", params.clerk_user_id)
      .single()

    if (checkError && checkError.code !== "PGRST116") { // PGRST116 is "no rows returned"
      return {
        success: false,
        error: "Failed to check for existing user"
      }
    }

    if (existingUser) {
      // User already exists, return their ID
      return {
        success: true,
        id: existingUser.id
      }
    }

    // Get the organization ID to use
    const orgId = params.organization_id || process.env.DEFAULT_ORGANIZATION_ID;
    if (!orgId) {
      return {
        success: false,
        error: "No valid organization_id found for clerk user creation."
      }
    }

    // Create new user
    const { data, error } = await supabase
      .from("clerk_users")
      .insert({
        clerk_user_id: params.clerk_user_id,
        email: params.email,
        first_name: params.first_name,
        last_name: params.last_name,
        organization_id: orgId
      })
      .select()
      .single()

    if (error) {
      return {
        success: false,
        error: error.message
      }
    }

    return {
      success: true,
      id: data.id
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error occurred"
    }
  }
}

async function ensureClerkUser(clerkUserId: string, email: string, firstName: string | null, lastName: string | null, organizationId?: string) {
  try {
    if (!email) {
      return {
        success: false,
        error: "Email is required for clerk user"
      }
    }

    const supabase = createSupabaseClient()

    // First try to get the user
    const { data: existingUser, error: getError } = await supabase
      .from("clerk_users")
      .select("id")
      .eq("clerk_user_id", clerkUserId)
      .maybeSingle()

    if (getError) {
      return {
        success: false,
        error: getError.message
      }
    }

    // If user exists, return their ID
    if (existingUser) {
      return {
        success: true,
        id: existingUser.id
      }
    }

    // If user doesn't exist, create them
    // Use the provided organization ID or fall back to the default
    const orgId = organizationId || process.env.DEFAULT_ORGANIZATION_ID;
    if (!orgId) {
      return {
        success: false,
        error: "DEFAULT_ORGANIZATION_ID environment variable is not set"
      }
    }

    const { data: newUser, error: createError } = await supabase
      .from("clerk_users")
      .insert({
        clerk_user_id: clerkUserId,
        email: email,
        first_name: firstName,
        last_name: lastName,
        organization_id: orgId
      })
      .select("id")
      .single();

    if (createError) {
      return {
        success: false,
        error: createError.message
      }
    }

    return {
      success: true,
      id: newUser.id
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error occurred"
    }
  }
}

async function listClerkUsers() {
  try {
    const supabase = createSupabaseClient()

    const { data, error } = await supabase
      .from("clerk_users")
      .select("*")

    if (error) {
      return {
        success: false,
        error: error.message
      }
    }

    return {
      success: true,
      users: data
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error occurred"
    }
  }
}

async function updateClerkUser(id: string, data: any) {
  try {
    const supabase = createSupabaseClient()

    // Get the Clerk user ID first
    const { data: userData, error: userError } = await supabase
      .from("clerk_users")
      .select("clerk_user_id")
      .eq("id", id)
      .single()

    if (userError) {
      return {
        success: false,
        error: userError.message
      }
    }

    // Sync name and email to Clerk if they changed
    if (userData?.clerk_user_id && (data.first_name !== undefined || data.last_name !== undefined || data.email !== undefined)) {
      try {
        const clerkUpdateData: { firstName?: string; lastName?: string; primaryEmailAddressID?: string } = {}

        if (data.first_name !== undefined) {
          clerkUpdateData.firstName = data.first_name || ""
        }
        if (data.last_name !== undefined) {
          clerkUpdateData.lastName = data.last_name || ""
        }

        // Update name in Clerk
        if (clerkUpdateData.firstName !== undefined || clerkUpdateData.lastName !== undefined) {
          await clerkClient.users.updateUser(userData.clerk_user_id, clerkUpdateData)
        }

        // Update email in Clerk (requires creating a new email address and setting it as primary)
        if (data.email) {
          const clerkUser = await clerkClient.users.getUser(userData.clerk_user_id)
          const currentPrimaryEmail = clerkUser.emailAddresses.find(
            e => e.id === clerkUser.primaryEmailAddressId
          )?.emailAddress

          if (currentPrimaryEmail !== data.email) {
            // Create new email and set as primary
            await clerkClient.emailAddresses.createEmailAddress({
              userId: userData.clerk_user_id,
              emailAddress: data.email,
              verified: true,
              primary: true
            })
          }
        }
      } catch (clerkError) {
        console.error("Failed to update user in Clerk:", clerkError)
        // Continue with Supabase update even if Clerk update fails
      }
    }

    // Update user in Supabase (role is managed in DB, not Clerk)
    const { error } = await supabase
      .from("clerk_users")
      .update(data)
      .eq("id", id)

    if (error) {
      return {
        success: false,
        error: error.message
      }
    }

    return {
      success: true
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error occurred"
    }
  }
}

async function deleteClerkUser(id: string) {
  try {
    const supabase = createSupabaseClient()

    // First get the user's Clerk ID
    const { data: userData, error: userError } = await supabase
      .from("clerk_users")
      .select("clerk_user_id")
      .eq("id", id)
      .single()

    if (userError) {
      return {
        success: false,
        error: userError.message
      }
    }

    if (!userData?.clerk_user_id) {
      return {
        success: false,
        error: "No Clerk user ID found"
      }
    }

    // Delete from Clerk first
    try {
      await clerkClient.users.deleteUser(userData.clerk_user_id)
    } catch (clerkError) {
      return {
        success: false,
        error: "Failed to delete user from Clerk"
      }
    }

    // Then delete from Supabase
    const { error } = await supabase
      .from("clerk_users")
      .delete()
      .eq("id", id)

    if (error) {
      return {
        success: false,
        error: error.message
      }
    }

    return {
      success: true
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error occurred"
    }
  }
}

async function syncOrganizationToClerk(organizationId: string) {
  try {
    const supabase = createSupabaseClient()

    // Get organization details from Supabase
    const { data: org, error: orgError } = await supabase
      .from("organizations")
      .select("*")
      .eq("id", organizationId)
      .single()

    if (orgError) {
      return {
        success: false,
        error: orgError.message
      }
    }

    if (!org) {
      return {
        success: false,
        error: "Organization not found"
      }
    }

    // Get all users in the organization
    const { data: users, error: usersError } = await supabase
      .from("clerk_users")
      .select("clerk_user_id")
      .eq("organization_id", organizationId)

    if (usersError) {
      return {
        success: false,
        error: usersError.message
      }
    }

    // Create or update organization in Clerk
    try {
      const clerkOrg = await clerkClient.organizations.createOrganization({
        name: org.name,
        createdBy: users[0]?.clerk_user_id // Use the first user as the creator
      })

      // Add all users to the organization
      for (const user of users) {
        await clerkClient.organizations.createOrganizationMembership({
          organizationId: clerkOrg.id,
          userId: user.clerk_user_id,
          role: "basic_member"
        })
      }

      return {
        success: true,
        organizationId: clerkOrg.id
      }
    } catch (clerkError) {
      return {
        success: false,
        error: clerkError instanceof Error ? clerkError.message : "Unknown error occurred"
      }
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error occurred"
    }
  }
}

async function handleOrganizationChange(organizationId: string) {
  try {
    await syncOrganizationToClerk(organizationId)
  } catch (error) {
    // Silently fail - this is a fire-and-forget operation
  }
}

async function updateUserOrganization(clerkUserId: string, organizationId: string) {
  try {
    const supabase = createSupabaseClient()

    const { error } = await supabase
      .from("clerk_users")
      .update({ organization_id: organizationId })
      .eq("clerk_user_id", clerkUserId)

    if (error) {
      return { success: false, error: error.message }
    }

    return { success: true }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Unknown error occurred" }
  }
}

export {
  getClerkUser,
  createClerkUser,
  ensureClerkUser,
  updateUserOrganization,
  listClerkUsers,
  updateClerkUser,
  deleteClerkUser,
  syncOrganizationToClerk,
  handleOrganizationChange
}
